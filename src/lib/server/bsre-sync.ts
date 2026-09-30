/**
 * Core BSrE sync logic — plain server-side functions, NOT remote functions.
 *
 * Remote `command()`/`query()` wrappers from `$app/server` require an active
 * HTTP request context (`get_request_store()`), so they throw
 * "Could not get the request store" when invoked from node-cron (no request).
 *
 * The cron (`src/lib/server/cron.ts`) and the remote module
 * (`src/lib/remotes/bsre.remote.ts`) both call the functions in this file.
 */
import { eq } from "drizzle-orm";
import { db } from "./db";
import { bsreUsers } from "./db/schema";
import { getAccessToken, handleBeIDLogin, openSession, tokenStore } from "./browser";
import { resolveEnv } from "./db/utils";

export const BSRE_URL = "https://portal-bsre.bssn.go.id/";
const BSRE_USERS_API = "https://portal-bsre.bssn.go.id/api/rest/manage/user/list";
export const BSRE_API_BASE = "https://portal-bsre.bssn.go.id/api/rest/manage";
export const BEID_HOST = "beid.bssn.go.id";

const PAGE_SIZE = 200;

/**
 * Build the headers every BSrE portal SPA request sends.
 * `x-user-ip` is sent by the frontend as the operator's public IP; the portal
 * rejects the call when it is missing, so we resolve it server-side.
 */
function buildApiHeaders(
  authorization: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    accept: "application/json, text/plain, */*",
    authorization,
    ...extra,
  };
}

/** Resolve the public IP to advertise in `x-user-ip`. */
let cachedPublicIp: { ip: string; at: number } | null = null;
const PUBLIC_IP_TTL_MS = 5 * 60 * 1000;

export async function getPublicIp(): Promise<string> {
  const env = await resolveEnv();
  if (env.PORTAL_BSRE_USER_IP) return env.PORTAL_BSRE_USER_IP;
  if (cachedPublicIp && Date.now() - cachedPublicIp.at < PUBLIC_IP_TTL_MS) {
    return cachedPublicIp.ip;
  }
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(5_000),
    });
    const data: any = await res.json();
    const ip = String(data?.ip ?? "").trim();
    if (ip) {
      cachedPublicIp = { ip, at: Date.now() };
      return ip;
    }
  } catch (err) {
    console.debug("[bsre] getPublicIp — lookup failed:", (err as Error)?.message);
  }
  return cachedPublicIp?.ip ?? "";
}

/**
 * Fetch a BSrE portal API endpoint with a Bearer token, transparently refreshing
 * the token and retrying once when the session has expired (401).
 */
export async function bsreApiFetch(
  userId: string,
  path: string,
  opts: { method?: string; body?: unknown; label?: string } = {},
): Promise<Response> {
  const { method = "GET", body, label = "api" } = opts;
  const url = path.startsWith("http") ? path : `${BSRE_API_BASE}${path}`;

  const send = async (authorization: string | null) => {
    const headers = buildApiHeaders(authorization ?? "", {
      "x-user-ip": await getPublicIp(),
    });
    if (body !== undefined) headers["content-type"] = "application/json;charset=UTF-8";
    return fetch(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  };

  let authorization = tokenStore.get(userId) ?? (await acquireToken(userId));
  if (!authorization) {
    return new Response(
      JSON.stringify({ success: false, message: "Token BSrE tidak tersedia." }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  let res = await send(authorization);
  if (res.status === 401) {
    console.log(`[bsre] ${label} — token expired (401), re-acquiring...`);
    tokenStore.delete(userId);
    authorization = await acquireToken(userId);
    if (!authorization) return res;
    res = await send(authorization);
  }
  return res;
}

/**
 * Full login / token-acquisition flow (shared between launchBsre and fetchBsreUsers).
 * 1. Opens (or reuses) a browser session
 * 2. Navigates to the BSrE portal
 * 3. Waits for URL to settle (portal stays or JS redirects to BEID)
 * 4. If on BEID → fills credentials/OTP → waits for SSO redirect back to portal
 * 5. Extracts token from localStorage / sessionStorage / brute-force scan
 * 6. Caches the token in tokenStore and returns it, or null on failure
 */
export async function acquireToken(userId: string): Promise<string | null> {
  console.debug("[bsre] acquireToken — start, userId:", userId);
  const session = await openSession(userId);
  console.debug("[bsre] acquireToken — session opened, mode:", session.mode);

  // Navigate to portal
  console.debug("[bsre] acquireToken — navigating to", BSRE_URL);
  try {
    await session.page.goto(BSRE_URL, { waitUntil: "load", timeout: 30_000 });
  } catch {
    console.debug("[bsre] acquireToken — goto interrupted (SSO), url:", session.page.url());
  }
  await session.page.waitForLoadState("load", { timeout: 15_000 }).catch(() => { });

  // Wait up to 8s for a JS-initiated SSO redirect to BEID.
  // NOTE: we only wait for the BEID host here — if the portal SPA detects an expired
  // SSO session it will redirect to BEID for re-authentication.  If we stay on the
  // portal the timeout fires and we proceed (the session is still good).
  try {
    await session.page.waitForFunction(
      (beid) => window.location.hostname.includes(beid as string),
      BEID_HOST,
      { timeout: 8_000 }
    );
  } catch {
    console.debug("[bsre] acquireToken — no BEID redirect within 8s, staying on portal, url:", session.page.url());
  }
  console.debug("[bsre] acquireToken — after settle, url:", session.page.url());

  // Handle BEID login if needed
  const isBeid = new URL(session.page.url()).hostname.includes(BEID_HOST);
  if (isBeid) {
    console.log("[bsre] acquireToken — on BEID, handling login");
    await handleBeIDLogin(session.page);
    console.debug("[bsre] acquireToken — login done, url:", session.page.url());

    // Wait for SSO redirect back to portal before checking localStorage
    console.log("[bsre] acquireToken — waiting for SSO redirect back to portal...");
    try {
      await session.page.waitForFunction(
        (host) => !new URL(window.location.href).hostname.includes(host as string),
        BEID_HOST,
        { timeout: 15_000 }
      );
    } catch {
      console.debug("[bsre] acquireToken — SSO redirect wait timed out, url:", session.page.url());
    }
  }

  // Extract token (only safe when on portal domain, not BEID)
  const stillBeid = new URL(session.page.url()).hostname.includes(BEID_HOST);
  if (stillBeid) {
    console.log("[bsre] acquireToken — still on BEID after login, cannot check localStorage");
    return null;
  }

  await session.page.waitForTimeout(1_500);

  let token = await getAccessToken(session.page);
  console.debug("[bsre] acquireToken — getAccessToken:", token ? "found ✓" : "null");

  if (!token) {
    console.log("[bsre] acquireToken — scanning localStorage...");
    token = await session.page.evaluate(() => {
      const known = [
        "access_token", "token", "auth_token", "bearer_token",
        "kc-access-token", "oidc.access_token", "keycloak-token",
      ];
      for (const key of known) {
        const val = localStorage.getItem(key);
        if (val) return val;
      }
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        const val = localStorage.getItem(key);
        if (val && val.length > 100) return val;
      }
      return null;
    }) as string | null;
    console.debug("[bsre] acquireToken — localStorage scan:", token ? "found ✓" : "null");
  }

  if (token) {
    const formatted = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    tokenStore.set(userId, formatted);
    console.debug("[bsre] acquireToken — token cached ✓");
    return formatted;
  }

  return null;
}

/**
 * Fetch all BSrE users and persist to the DB.
 * Plain function — callable from cron (no request context needed).
 */
export async function fetchBsreUsersCore({
  userId,
  search = "",
}: {
  userId: string;
  search?: string;
}): Promise<{ success: boolean; total?: number; message?: string; data?: unknown }> {
  let authorization: string | null = tokenStore.get(userId) ?? null;
  console.debug("[bsre] fetchBsreUsers — token cached?", !!authorization, "userId:", userId);

  // Acquire token if not cached
  if (!authorization) {
    console.debug("[bsre] fetchBsreUsers — no token, acquiring...");
    authorization = await acquireToken(userId);
  }

  // If still no token after proactive fetch, bail
  if (!authorization) {
    return {
      success: false,
      message: "Gagal mendapatkan token secara otomatis. Coba klik 'Buka Portal BSrE' dulu.",
      data: null,
    };
  }

  // Helper to make an API call with the current authorization
  const apiFetch = (url: string, opts: RequestInit = {}) => {
    return fetch(url, {
      ...opts,
      headers: { ...opts.headers, authorization: authorization! } as HeadersInit,
    });
  };

  try {
    // First: fetch a single row to determine total records
    const countRes = await apiFetch(BSRE_USERS_API, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json;charset=UTF-8",
      },
      body: JSON.stringify({ search, start: 0, length: 1, filters: null }),
    });

    // Handle 401 — acquire fresh token and retry once
    if (countRes.status === 401) {
      console.log("[bsre] fetchBsreUsers — token expired (401), re-acquiring...");
      tokenStore.delete(userId);
      authorization = await acquireToken(userId);
      if (!authorization) {
        return { success: false, message: "Gagal memperbarui token setelah 401.", data: null };
      }
      // Retry the count request with the fresh token
      const retryRes = await apiFetch(BSRE_USERS_API, {
        method: "POST",
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json;charset=UTF-8",
        },
        body: JSON.stringify({ search, start: 0, length: 1, filters: null }),
      });
      if (!retryRes.ok) {
        return { success: false, message: `API error after token refresh: ${retryRes.status} ${retryRes.statusText}`, data: null };
      }
      const retryData = await retryRes.json();
      const totalRecords = retryData?.data?.records ?? retryData?.recordsTotal ?? retryData?.total ?? 0;
      return await paginateAll(userId, search, totalRecords, authorization);
    }

    if (!countRes.ok) {
      return { success: false, message: `API error: ${countRes.status} ${countRes.statusText}`, data: null };
    }

    const countData = await countRes.json();
    const totalRecords = countData?.data?.records ?? countData?.recordsTotal ?? countData?.total ?? 0;

    return await paginateAll(userId, search, totalRecords, authorization);
  } catch (err: any) {
    return { success: false, message: err?.message ?? "Gagal fetch API.", data: null };
  }
}

/**
 * Paginate through all pages of BSrE user data and persist to DB.
 * Extracted so the 401-retry path can reuse it without duplicating the pagination loop.
 */
async function paginateAll(userId: string, search: string, totalRecords: number, authorization: string) {
  const apiFetch = async (url: string, opts: RequestInit) => {
    return fetch(url, { ...opts, headers: { ...opts.headers, authorization } });
  };

  let processed = 0;
  let start = 0;

  while (start < totalRecords) {
    const length = Math.min(PAGE_SIZE, totalRecords - start);
    console.log(`[bsre] Fetching page: start=${start}, length=${length}, total=${totalRecords}`);

    const pageRes = await apiFetch(BSRE_USERS_API, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json;charset=UTF-8",
      },
      body: JSON.stringify({ search, start, length, filters: null }),
    });

    if (!pageRes.ok) {
      return { success: false, message: `API error at start=${start}: ${pageRes.status} ${pageRes.statusText}`, data: null };
    }

    const pageData = await pageRes.json();
    const records: any[] = pageData?.data?.aaData ?? [];

    if (Array.isArray(records) && records.length > 0) {
      console.log(`[bsre] Fetching details for ${records.length} users (page ${Math.floor(start / PAGE_SIZE) + 1})...`);
      for (const user of records) {
        if (!user?.id) continue;
        try {
          await new Promise((resolve) => setTimeout(resolve, 100));

          const detailRes = await apiFetch(`https://portal-bsre.bssn.go.id/api/rest/manage/user/details/${user.id}`, {
            method: "GET",
            headers: { accept: "application/json, text/plain, */*" },
          });
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            const merged = {
              ...user,
              ...detailData?.data,
              ...detailData?.data?.profile,
              ...detailData,
            };

            const sertifikat: any[] = detailData?.data?.sertifikat ?? [];
            const latestCert = sertifikat.length > 0
              ? [...sertifikat].sort(
                (a, b) => new Date(b.notAfterDate).getTime() - new Date(a.notAfterDate).getTime()
              )[0]
              : null;
            const certificateStatus = latestCert?.status ?? merged.certificateStatus ?? null;

            const record = {
              nama: merged.nama ?? null,
              emailAddress: merged.emailAddress ?? null,
              username: merged.username ?? null,
              nik: merged.nik ?? null,
              nip: merged.nip ?? null,
              jabatanOrganisasi: merged.jabatanOrganisasi ?? null,
              organisasiUnit: merged.organisasiUnit ?? null,
              organisasi: merged.organisasi ?? null,
              phone: merged.phone ?? merged.no_wa ?? null,
              status: merged.status ?? null,
              aktif: merged.aktif ?? null,
              certificateStatus,
              products: merged.products ?? null,
              createdDate: merged.createdDate ?? null,
              registeredOrigin: merged.registeredOrigin ?? null,
              verifiedDukcapil: merged.verifiedDukcapil ?? null,
              verifiedLiveness: merged.verfifiedLiveness ?? null,
              phoneVerified: merged.phoneVerified ?? null,
              verifiedVerifikator: merged.verifiedVerifikator ?? null,
              details: detailData,
              certStart: latestCert?.notBeforeDate?.split(' ')[0] ?? null,
              certEnd: latestCert?.notAfterDate?.split(' ')[0] ?? null,
            };
            await db.insert(bsreUsers).values({ id: user.id, ...record }).onConflictDoUpdate({
              target: bsreUsers.id,
              set: { ...record, fetchedAt: new Date().toISOString() },
            });
          }
        } catch (err) {
          console.error(`[bsre] Error fetching details for user ${user.id}:`, err);
        }
      }
    }

    processed += records.length;
    start += length;
  }

  console.log("[bsre] users synced:", processed, "records");
  return { success: true, total: processed };
}

// ---------------------------------------------------------------------------
// Certificate passphrase reset
// ---------------------------------------------------------------------------

/** Statuses for which the portal exposes a usable certificate (reset allowed). */
const RESETTABLE_CERT_STATUSES = new Set(["ISSUE"]);

type CertLike = {
  id?: string | null;
  status?: string | null;
  product?: string | null;
  serialNumber?: string | null;
  notBeforeDate?: string | null;
  notAfterDate?: string | null;
  jenisSertifikat?: string | null;
};

/** Read a cert list out of either a raw details payload or an already-parsed array. */
function extractCerts(details: unknown): CertLike[] {
  if (Array.isArray(details)) return details as CertLike[];
  const list = (details as any)?.data?.sertifikat ?? (details as any)?.sertifikat;
  return Array.isArray(list) ? (list as CertLike[]) : [];
}

/**
 * List the certificates of a BSrE user, preferring the locally-synced snapshot
 * so the table renders instantly and without hitting the portal.
 */
export async function listUserCerts(userId: string, bsreUserId: string) {
  const row = await db
    .select({ details: bsreUsers.details })
    .from(bsreUsers)
    .where(eq(bsreUsers.id, bsreUserId))
    .limit(1);

  const certs = extractCerts(row[0]?.details);
  return certs
    .map((cert) => ({
      id: cert.id ?? "",
      status: cert.status ?? null,
      product: cert.product ?? null,
      serialNumber: cert.serialNumber ?? null,
      notBeforeDate: cert.notBeforeDate?.split(" ")[0] ?? null,
      notAfterDate: cert.notAfterDate?.split(" ")[0] ?? null,
      jenisSertifikat: cert.jenisSertifikat ?? null,
      // The portal identifies the certificate by serial number in the reset URL,
      // so a cert without one cannot be reset even when it is in ISSUE status.
      canReset:
        Boolean(cert.serialNumber) && RESETTABLE_CERT_STATUSES.has(cert.status ?? ""),
    }))
    .sort((a, b) => {
      // Newest expiry first, mirroring the ordering of the main table.
      const av = a.notAfterDate ?? "";
      const bv = b.notAfterDate ?? "";
      return bv.localeCompare(av);
    });
}

/**
 * Ask the BSrE portal to reset the token passphrase of a certificate.
 *
 * GET /cert/passphrase/reset/{user_id}/{serial_number}
 *
 * The last path segment is the certificate **serial number** (e.g.
 * `4813bb4a21418170a5ce2fb60202580d6ce47b80`), not the certificate's UUID `id` —
 * passing the UUID returns 404 "Serial number sertifikat tidak valid".
 */
export async function resetCertPassphraseCore({
  userId,
  bsreUserId,
  serialNumber,
}: {
  userId: string;
  bsreUserId: string;
  serialNumber: string;
}): Promise<{
  success: boolean;
  message: string;
  data?: unknown;
}> {
  if (!bsreUserId || !serialNumber) {
    return { success: false, message: "ID pengguna atau sertifikat tidak valid." };
  }

  const path = `/cert/passphrase/reset/${encodeURIComponent(bsreUserId)}/${encodeURIComponent(serialNumber)}`;

  try {
    const res = await bsreApiFetch(userId, path, {
      method: "GET",
      label: "resetCertPassphrase",
    });

    const text = await res.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (!res.ok) {
      console.log("[bsre] resetCertPassphrase — failed:", res.status, text?.slice(0, 300));
      const message =
        payload?.message ??
        payload?.data?.message ??
        (res.status === 401
          ? "Token BSrE tidak valid. Klik 'Update Token' lalu coba lagi."
          : `Gagal reset passphrase (HTTP ${res.status}).`);
      return { success: false, message, data: payload };
    }

    // The portal answers 200 OK even for rejected requests, signalling the real
    // outcome through its own `success` field — so honour that over the status
    // code, otherwise a refusal gets reported as a success toast.
    if (payload && typeof payload === "object" && payload.success === false) {
      console.log("[bsre] resetCertPassphrase — portal refused:", text?.slice(0, 300));
      return {
        success: false,
        message: payload.message ?? "Permintaan reset ditolak oleh portal BSrE.",
        data: payload,
      };
    }

    const message =
      payload?.message ??
      payload?.data?.message ??
      "Passphrase sertifikat berhasil direset.";

    console.log("[bsre] resetCertPassphrase — ok:", message);
    return { success: true, message, data: payload };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message ?? "Gagal menghubungi portal BSrE.",
    };
  }
}

/** Products the BSrE portal accepts for a new certificate request. */
export const BSRE_CERT_PRODUCTS = [
  "Tanda Tangan Elektronik",
  "Tanda Tangan Digital",
] as const;

export type BsreCertProduct = (typeof BSRE_CERT_PRODUCTS)[number];

/** Pull the conflicting serial number out of the portal's refusal message. */
function extractBlockingSerial(message: string): string | null {
  return message.match(/\b[0-9a-f]{20,}\b/i)?.[0] ?? null;
}

/**
 * Request a new e-signature certificate for a portal user.
 *
 * POST /cert/request/esign/{user_id}
 *
 * The portal refuses with `success: false` when the user still holds an active
 * certificate, naming the blocking serial number in the message:
 * "Terdapat sertifikat yang masih aktif dengan serial number 6f7ed6fb…".
 * Use `blockingSerial` to point the operator straight at the offending entry.
 */
export async function requestEsignCertCore({
  userId,
  bsreUserId,
  cn,
  product = "Tanda Tangan Elektronik",
  jenisSertifikat = "INDIVIDU",
  dataDukung = [],
}: {
  userId: string;
  bsreUserId: string;
  cn: string;
  product?: BsreCertProduct | string;
  jenisSertifikat?: string;
  dataDukung?: unknown[];
}): Promise<{
  success: boolean;
  message: string;
  data?: unknown;
  blockingSerial?: string | null;
}> {
  if (!bsreUserId || !cn?.trim()) {
    return { success: false, message: "ID pengguna atau common name tidak valid." };
  }

  const path = `/cert/request/esign/${encodeURIComponent(bsreUserId)}`;

  try {
    const res = await bsreApiFetch(userId, path, {
      method: "POST",
      body: {
        product,
        jenisSertifikat,
        cn: cn.trim(),
        dataDukung,
      },
      label: "requestEsignCert",
    });

    const text = await res.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (!res.ok) {
      console.log("[bsre] requestEsignCert — failed:", res.status, text?.slice(0, 300));
      const message =
        payload?.message ??
        payload?.data?.message ??
        (res.status === 401
          ? "Token BSrE tidak valid. Klik 'Update Token' lalu coba lagi."
          : `Gagal membuat sertifikat (HTTP ${res.status}).`);
      return { success: false, message, data: payload };
    }

    // Same quirk as reset: HTTP 200 can still carry `success: false`.
    if (payload && typeof payload === "object" && payload.success === false) {
      console.log("[bsre] requestEsignCert — portal refused:", text?.slice(0, 300));
      const message = payload.message ?? "Permintaan sertifikat ditolak oleh portal BSrE.";
      return {
        success: false,
        message,
        data: payload,
        blockingSerial: extractBlockingSerial(message),
      };
    }

    const message =
      payload?.message ??
      payload?.data?.message ??
      "Permintaan sertifikat berhasil dibuat.";

    console.log("[bsre] requestEsignCert — ok:", message);
    return { success: true, message, data: payload };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message ?? "Gagal menghubungi portal BSrE.",
    };
  }
}
