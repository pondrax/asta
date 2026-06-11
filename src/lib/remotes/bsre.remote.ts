import { command, query } from "$app/server";
import { type } from "arktype";
import type { Page } from "playwright-core";
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
    const session = await openSession(userId);
    await session.page.goto(BSRE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });

    let token = await getAccessToken(session.page);
    console.log("[bsre] token after launch:", token ? "found ✓" : "NOT found ✗");

    // If no token and on BEID login, handle it
    if (!token && new URL(session.page.url()).hostname.includes(BEID_HOST)) {
      await handleBeIDLogin(session.page);
      await session.page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => { });
      token = await getAccessToken(session.page);
      console.log("[bsre] token after BEID login:", token ? "found ✓" : "NOT found ✗");
    }

    // If no token and not on BEID, force a redirect to trigger login
    if (!token) {
      console.log("[bsre] no token found, re-navigating to force login redirect");
      await session.page.goto(BSRE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (new URL(session.page.url()).hostname.includes(BEID_HOST)) {
        await handleBeIDLogin(session.page);
        await session.page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => { });
        token = await getAccessToken(session.page);
        console.log("[bsre] token after re-login:", token ? "found ✓" : "NOT found ✗");
      }
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
      hasToken: !!token,
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
    const s = sessions.get(userId);
    if (!s) return { success: false, message: "Tidak ada sesi aktif." };

    await s.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    if (new URL(s.page.url()).hostname.includes(BEID_HOST) && userId === "auto-sync") {
      await handleBeIDLogin(s.page);
      await s.page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => { });
    }

    // Re-cache token after navigation
    await cacheToken(userId, s.page);

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
    const s = sessions.get(userId);
    if (!s) return { success: false, message: "Tidak ada sesi aktif." };
    try {
      const info = await s.page.evaluate(() => {
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

    if (!authorization) {
      const s = sessions.get(userId);
      if (s) {
        // Cek apakah URL sudah redirect ke halaman login BEID
        if (new URL(s.page.url()).hostname.includes(BEID_HOST)) {
          await handleBeIDLogin(s.page);
          await s.page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => { });
        }

        const token = await getAccessToken(s.page);
        if (token) {
          authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
          tokenStore.set(userId, authorization);
        }
        // Session tidak diperlukan lagi setelah token didapatkan
        await closeSession(userId);
      }
    }

    if (!authorization) {
      return {
        success: false,
        message: "Token tidak ditemukan. Klik 'Buka Portal BSrE' terlebih dahulu agar sistem dapat login dan mendapatkan token.",
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
      if (sessions.has(userId)) {
        await closeSession(userId);
      }
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
