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
import { db } from "./db";
import { bsreUsers } from "./db/schema";
import { getAccessToken, handleBeIDLogin, openSession, tokenStore } from "./browser";

export const BSRE_URL = "https://portal-bsre.bssn.go.id/";
const BSRE_USERS_API = "https://portal-bsre.bssn.go.id/api/rest/manage/user/list";
export const BEID_HOST = "beid.bssn.go.id";

const PAGE_SIZE = 200;

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
