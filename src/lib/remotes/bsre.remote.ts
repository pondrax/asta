import { command, query } from "$app/server";
import { type } from "arktype";
import { and, eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { bsreUsers } from "$lib/server/db/schema";
import {
  cacheToken,
  closeSession,
  getAccessToken,
  handleBeIDLogin,
  openSession,
  sessionInfo,
  sessions,
  tokenStore,
} from "$lib/server/browser";

const BSRE_URL = "https://portal-bsre.bssn.go.id/";
const BSRE_USERS_API = "https://portal-bsre.bssn.go.id/api/rest/manage/user/list";
const BEID_HOST = "beid.bssn.go.id";

export const launchBsre = command(
  type({ userId: "string" }),
  async ({ userId }) => {
    console.debug("[bsre] launchBsre — start, userId:", userId);
    const session = await openSession(userId);
    console.debug("[bsre] launchBsre — session obtained, mode:", session.mode);

    // 1. Check if token already cached (from request interception or previous session)
    let token: string | null | undefined = tokenStore.get(userId);
    console.debug("[bsre] launchBsre — tokenStore.has(userId):", !!token);
    if (token) {
      console.log("[bsre] token already cached ✓");
      const modeLabel = session.mode.startsWith("remote") ? "remote CDP" : "browser lokal";
      return {
        success: true,
        message: `Token sudah tersedia. Browser BSrE via ${modeLabel}.`,
        mode: session.mode,
        hasToken: true,
      };
    }

    // 2. Navigate — wrap in try-catch because SSO redirect may interrupt navigation
    //    when the user already has an active Keycloak session
    console.debug("[bsre] launchBsre — navigating to", BSRE_URL);
    try {
      await session.page.goto(BSRE_URL, { waitUntil: "load", timeout: 30_000 });
      console.debug("[bsre] launchBsre — goto completed, url:", session.page.url());
    } catch {
      console.debug("[bsre] launchBsre — goto interrupted (SSO redirect), url:", session.page.url());
    }
    await session.page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});

    // Wait a beat for JS-initiated SSO redirects that fire *after* the load event
    try {
      await session.page.waitForFunction(
        (beid) => {
          const host = window.location.hostname;
          // Wait until URL stabilises on either portal or BEID (not an intermediate state)
          return host.includes(beid as string) || host === "portal-bsre.bssn.go.id";
        },
        BEID_HOST,
        { timeout: 8_000 }
      );
    } catch {
      console.debug("[bsre] launchBsre — URL settle wait timed out, url:", session.page.url());
    }
    console.debug("[bsre] launchBsre — after settle, url:", session.page.url());

    // 3. If we landed on BEID login, handle credentials + OTP
    const isBeid = new URL(session.page.url()).hostname.includes(BEID_HOST);
    console.debug("[bsre] launchBsre — after nav, on BEID?", isBeid, "url:", session.page.url());
    if (isBeid) {
      console.log("[bsre] on BEID login page — handling login");
      await handleBeIDLogin(session.page);
      console.debug("[bsre] launchBsre — handleBeIDLogin returned, url now:", session.page.url());
      // Wait for SSO redirect back to portal before checking localStorage
      console.log("[bsre] waiting for redirect back to portal...");
      try {
        await session.page.waitForFunction(
          (host) => !new URL(window.location.href).hostname.includes(host as string),
          BEID_HOST,
          { timeout: 15_000 }
        );
        console.debug("[bsre] launchBsre — redirect detected, url:", session.page.url());
      } catch {
        console.debug("[bsre] launchBsre — redirect wait timed out, url:", session.page.url());
      }
    }

    // 4. Only check localStorage once we're back on portal (not BEID domain)
    const stillBeid = new URL(session.page.url()).hostname.includes(BEID_HOST);
    console.debug("[bsre] launchBsre — checking token, still on BEID?", stillBeid);
    if (!stillBeid) {
      await session.page.waitForTimeout(1_500);
      token = await getAccessToken(session.page);
      console.debug("[bsre] launchBsre — getAccessToken returned:", token ? "found ✓" : "NOT found ✗");

      // 5. If still no token, brute-force scan localStorage for any JWT-like value
      if (!token) {
        console.log("[bsre] scanning localStorage for token...");
        token = await session.page.evaluate(() => {
          const known = [
            "access_token", "token", "auth_token", "bearer_token",
            "kc-access-token", "oidc.access_token", "keycloak-token"
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
        console.debug("[bsre] launchBsre — localStorage scan result:", token ? "found ✓" : "null");
      }
    } else {
      console.log("[bsre] still on BEID after login — skipping localStorage check");
    }

    // Cache token for the user
    if (token) {
      tokenStore.set(userId, token.startsWith("Bearer ") ? token : `Bearer ${token}`);
    }

    const modeLabel = session.mode.startsWith("remote") ? "remote CDP" : "browser lokal";
    return {
      success: true,
      message: `Browser BSrE dibuka via ${modeLabel}. Token: ${token ? "✓" : "tidak ditemukan"}`,
      mode: session.mode,
      hasToken: Boolean(token),
    };
  }
);

export const closeBsre = command(
  type({ userId: "string" }),
  async ({ userId }) => {
    await closeSession(userId);
    // Keep token in tokenStore for continued API access
    return { success: true, message: "Sesi BSrE ditutup." };
  }
);

export const navigateBsre = command(
  type({ userId: "string", url: "string" }),
  async ({ userId, url }) => {
    const client = sessions.get(userId);
    if (!client) return { success: false, message: "Tidak ada sesi aktif." };

    await client.page.goto(url, { waitUntil: "load", timeout: 15_000 });

    if (new URL(client.page.url()).hostname.includes(BEID_HOST) && userId === "auto-sync") {
      await client.page.waitForLoadState("load", { timeout: 15_000 });
      await handleBeIDLogin(client.page);
    }

    // Re-cache token after navigation
    await cacheToken(userId, client.page);

    return { success: true, message: `Navigasi ke ${url} berhasil.` };
  }
);

export const getSessionStatus = query(
  type({ userId: "string" }),
  async ({ userId }) => {
    const latestUser = await db.query.bsreUsers.findFirst({
      orderBy: (t, { desc }) => [desc(t.fetchedAt)],
      columns: { fetchedAt: true },
    });
    return {
      ...sessionInfo(userId),
      hasToken: tokenStore.has(userId),
      lastSync: latestUser?.fetchedAt ?? null,
    };
  }
);

export const debugBsreSession = command(
  type({ userId: "string" }),
  async ({ userId }) => {
    const client = sessions.get(userId);
    if (!client) return { success: false, message: "Tidak ada sesi aktif." };
    try {
      const info = await client.page.evaluate(() => {
        return {
          url: window.location.href,
          localStorage: { ...localStorage },
          sessionStorage: { ...sessionStorage },
          cookies: document.cookie,
        };
      });
      return {
        success: true,
        info,
        tokenStoreVal: tokenStore.get(userId),
      };
    } catch (e: any) {
      return { success: false, message: e?.message ?? "Gagal mengambil data debug." };
    }
  }
);

const PAGE_SIZE = 200;

export const fetchBsreUsers = command(
  type({
    userId: "string",
    search: "string?",
  }),
  async ({ userId, search = "" }) => {
    let authorization = tokenStore.get(userId);
    console.debug("[bsre] fetchBsreUsers — token cached?", !!authorization, "userId:", userId);

    // Proactively fetch token if not cached — same flow as launchBsre
    if (!authorization) {
      console.debug("[bsre] fetchBsreUsers — no token, opening session...");
      const session = await openSession(userId);
      console.debug("[bsre] fetchBsreUsers — session opened, mode:", session.mode);

      // Navigate to portal — SSO redirect may interrupt, that's ok
      console.debug("[bsre] fetchBsreUsers — navigating to", BSRE_URL);
      try {
        await session.page.goto(BSRE_URL, { waitUntil: "load", timeout: 30_000 });
        console.debug("[bsre] fetchBsreUsers — goto done, url:", session.page.url());
      } catch {
        console.debug("[bsre] fetchBsreUsers — goto interrupted (SSO), url:", session.page.url());
      }
      await session.page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});

      // Wait a beat for JS-initiated SSO redirects that fire *after* the load event
      try {
        await session.page.waitForFunction(
          (beid) => {
            const host = window.location.hostname;
            return host.includes(beid as string) || host === "portal-bsre.bssn.go.id";
          },
          BEID_HOST,
          { timeout: 8_000 }
        );
      } catch {
        console.debug("[bsre] fetchBsreUsers — URL settle wait timed out, url:", session.page.url());
      }
      console.debug("[bsre] fetchBsreUsers — after settle, url:", session.page.url());

      // Handle BEID login (no-op if not on BEID host — self-guarding)
      console.debug("[bsre] fetchBsreUsers — calling handleBeIDLogin, url:", session.page.url());
      await handleBeIDLogin(session.page);
      console.debug("[bsre] fetchBsreUsers — handleBeIDLogin returned, url:", session.page.url());

      // Wait for SSO redirect back to portal before checking localStorage
      console.log("[bsre] sync: waiting for redirect back to portal...");
      try {
        await session.page.waitForFunction(
          (host) => !new URL(window.location.href).hostname.includes(host as string),
          BEID_HOST,
          { timeout: 15_000 }
        );
        console.debug("[bsre] fetchBsreUsers — redirect detected, url:", session.page.url());
      } catch {
        console.debug("[bsre] fetchBsreUsers — redirect wait timed out, url:", session.page.url());
      }

      // Only check localStorage once we're on portal (BEID has no token)
      let token: string | null = null;
      const isBeid = new URL(session.page.url()).hostname.includes(BEID_HOST);
      console.debug("[bsre] fetchBsreUsers — after redirect wait, on BEID?", isBeid);
      if (!isBeid) {
        await session.page.waitForTimeout(1_500);

        token = await getAccessToken(session.page);
        console.debug("[bsre] fetchBsreUsers — getAccessToken:", token ? "found ✓" : "null");

        if (!token) {
          console.log("[bsre] sync: scanning localStorage for token...");
          token = await session.page.evaluate(() => {
            const known = [
              "access_token", "token", "auth_token", "bearer_token",
              "kc-access-token", "oidc.access_token", "keycloak-token"
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
          console.debug("[bsre] fetchBsreUsers — localStorage scan result:", token ? "found ✓" : "null");
        }
      } else {
        console.log("[bsre] sync: still on BEID — skipping localStorage check");
      }

      if (token) {
        authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
        tokenStore.set(userId, authorization);
      }
      // Keep the session alive — token is cached, page will be reused next launch
    }

    // If still no token after proactive fetch, bail with a clear message
    if (!authorization) {
      return {
        success: false,
        message: "Gagal mendapatkan token secara otomatis. Coba klik 'Buka Portal BSrE' dulu.",
        data: null,
      };
    }

    try {
      // First: fetch a single row to determine total records
      const countRes = await fetch(BSRE_USERS_API, {
        method: "POST",
        headers: {
          accept: "application/json, text/plain, */*",
          authorization,
          "content-type": "application/json;charset=UTF-8",
        },
        body: JSON.stringify({ search, start: 0, length: 1, filters: null }),
      });

      if (!countRes.ok) {
        if (countRes.status === 401) tokenStore.delete(userId);
        return { success: false, message: `API error: ${countRes.status} ${countRes.statusText}`, data: null };
      }

      const countData = await countRes.json();
      const totalRecords = countData?.data?.records ?? countData?.recordsTotal ?? countData?.total ?? 0;

      // Then: paginate through all pages
      let processed = 0;
      let start = 0;

      while (start < totalRecords) {
        const length = Math.min(PAGE_SIZE, totalRecords - start);
        console.log(`[bsre] Fetching page: start=${start}, length=${length}, total=${totalRecords}`);

        const pageRes = await fetch(BSRE_USERS_API, {
          method: "POST",
          headers: {
            accept: "application/json, text/plain, */*",
            authorization,
            "content-type": "application/json;charset=UTF-8",
          },
          body: JSON.stringify({ search, start, length, filters: null }),
        });

        if (!pageRes.ok) {
          if (pageRes.status === 401) tokenStore.delete(userId);
          return { success: false, message: `API error at start=${start}: ${pageRes.status} ${pageRes.statusText}`, data: null };
        }

        const pageData = await pageRes.json();
        const records: any[] = pageData?.data?.aaData ?? [];

        if (Array.isArray(records) && records.length > 0) {
          console.log(`[bsre] Fetching details for ${records.length} users (page ${Math.floor(start / PAGE_SIZE) + 1})...`);
          for (const user of records) {
            if (!user?.id) continue;
            try {
              // Rate limit delay (100ms)
              await new Promise((resolve) => setTimeout(resolve, 100));

              const detailRes = await fetch(`https://portal-bsre.bssn.go.id/api/rest/manage/user/details/${user.id}`, {
                method: "GET",
                headers: {
                  accept: "application/json, text/plain, */*",
                  authorization,
                },
              });
              if (detailRes.ok) {
                const detailData = await detailRes.json();
                const merged = {
                  ...user,
                  ...detailData?.data,
                  ...detailData?.data?.profile,
                  ...detailData,
                };

                // Derive certificate status from the latest sertifikat entry (by notAfterDate desc)
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
    } catch (err: any) {
      return { success: false, message: err?.message ?? "Gagal fetch API.", data: null };
    }
  }
);

type StatsFilter = {
  status?: string;
  certificateStatus?: string;
  chartStartDate?: string;
  chartEndDate?: string;
};

const selectCols = { status: bsreUsers.status, certificateStatus: bsreUsers.certificateStatus, details: bsreUsers.details } as const;

function aggregateStats(users: { status: string | null; certificateStatus: string | null; details: unknown }[]) {
  const userStatusCounts: Record<string, number> = {};
  const certStatusCounts: Record<string, number> = {};
  for (const u of users) {
    const us = u.status || "unknown";
    userStatusCounts[us] = (userStatusCounts[us] ?? 0) + 1;
    const cs = u.certificateStatus || "none";
    certStatusCounts[cs] = (certStatusCounts[cs] ?? 0) + 1;
  }
  return { userStatusCounts, certStatusCounts, total: users.length };
}

function buildChartData(users: { details: unknown }[], chartStartDate?: string, chartEndDate?: string) {
  const byDate: Record<string, { start: number; end: number }> = {};
  for (const u of users) {
    const certs: any[] = (u.details as any)?.data?.sertifikat ?? [];
    for (const cert of certs) {
      const startRaw = (cert.notBeforeDate as string) ?? "";
      const startDate = startRaw.split(" ")[0];
      if (startDate) {
        if (
          (!chartStartDate || startDate >= chartStartDate) &&
          (!chartEndDate || startDate <= chartEndDate)
        ) {
          if (!byDate[startDate]) byDate[startDate] = { start: 0, end: 0 };
          byDate[startDate].start++;
        }
      }
      const endRaw = (cert.notAfterDate as string) ?? "";
      const endDate = endRaw.split(" ")[0];
      if (endDate) {
        if (
          (!chartStartDate || endDate >= chartStartDate) &&
          (!chartEndDate || endDate <= chartEndDate)
        ) {
          if (!byDate[endDate]) byDate[endDate] = { start: 0, end: 0 };
          byDate[endDate].end++;
        }
      }
    }
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({
      date,
      label: new Date(date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
      ...counts,
    }));
}

export const getBsreStats = query(
  type({ status: "string?", certificateStatus: "string?", chartStartDate: "string?", chartEndDate: "string?" }),
  async ({ status, certificateStatus, chartStartDate, chartEndDate }: StatsFilter) => {
    const conditions: ReturnType<typeof eq>[] = [];
    if (status) conditions.push(eq(bsreUsers.status, status));
    if (certificateStatus) conditions.push(eq(bsreUsers.certificateStatus, certificateStatus));

    // All users — for total and user status counts
    const allUsers = await db.select(selectCols).from(bsreUsers);
    const all = aggregateStats(allUsers);

    // Users filtered by status only — for cert status counts
    let certQuery = db.select(selectCols).from(bsreUsers);
    if (status) certQuery = certQuery.where(eq(bsreUsers.status, status)) as any;
    const certUsers = await certQuery;
    const certStats = aggregateStats(certUsers);

    // Users filtered by both status and certificateStatus — for chart only
    let chartQuery = db.select(selectCols).from(bsreUsers);
    if (conditions.length > 0) chartQuery = chartQuery.where(and(...conditions)) as any;
    const chartFiltered = await chartQuery;
    const chartData = buildChartData(chartFiltered, chartStartDate, chartEndDate);

    return {
      total: all.total,
      userStatusCounts: all.userStatusCounts,
      certStatusCounts: certStats.certStatusCounts,
      chartData,
    };
  }
);
