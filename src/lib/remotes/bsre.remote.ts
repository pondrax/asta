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
import { acquireToken, BEID_HOST, BSRE_URL, fetchBsreUsersCore } from "$lib/server/bsre-sync";

export const launchBsre = command(
  type({ userId: "string" }),
  async ({ userId }) => {
    console.debug("[bsre] launchBsre — start, userId:", userId);
    const session = await openSession(userId);
    console.debug("[bsre] launchBsre — session obtained, mode:", session.mode);

    // 1. Check if token already cached (from request interception or previous session)
    const cached = tokenStore.get(userId);
    if (cached) {
      // Navigate to portal and verify localStorage still has the token (SSO still alive)
      console.debug("[bsre] launchBsre — cached token exists, verifying localStorage...");
      try {
        await session.page.goto(BSRE_URL, { waitUntil: "load", timeout: 30_000 });
      } catch {
        console.debug("[bsre] launchBsre — goto interrupted (SSO), url:", session.page.url());
      }
      await session.page.waitForLoadState("load", { timeout: 15_000 }).catch(() => { });
      // Wait for URL to settle (catch JS redirect to BEID)
      try {
        await session.page.waitForFunction(
          (beid) => {
            const host = window.location.hostname;
            return host.includes(beid as string) || host === "portal-bsre.bssn.go.id";
          },
          BEID_HOST,
          { timeout: 8_000 }
        );
      } catch { }

      const hasLsToken = await session.page.evaluate(() => {
        const val = localStorage.getItem("access_token");
        return !!val;
      });
      console.debug("[bsre] launchBsre — localStorage.accessToken exists?", hasLsToken);

      if (hasLsToken) {
        // SSO session is alive — cached token is still good
        console.log("[bsre] token already cached ✓ (verified via localStorage)");
        const modeLabel = session.mode.startsWith("remote") ? "remote CDP" : "browser lokal";
        return {
          success: true,
          message: `Token sudah tersedia. Browser BSrE via ${modeLabel}.`,
          mode: session.mode,
          hasToken: true,
        };
      }

      // localStorage is empty — SSO session died, clear cached token and re-acquire
      console.log("[bsre] cached token expired (no localStorage.accessToken), re-acquiring...");
      tokenStore.delete(userId);
    }

    // 2. Acquire a fresh token (navigate → login if BEID → extract from localStorage)
    const token = await acquireToken(userId);

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

export const fetchBsreUsers = command(
  type({
    userId: "string",
    search: "string?",
  }),
  fetchBsreUsersCore
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
