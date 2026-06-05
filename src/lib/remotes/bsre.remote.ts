import { command, query } from "$app/server";
import { type } from "arktype";
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

    // Handle immediate BeID redirect
    if (new URL(session.page.url()).hostname.includes(BEID_HOST)) {
      await handleBeIDLogin(session.page);
      // Wait for redirect back to portal
      await session.page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    }

    // Cache token after successful login
    const token = await cacheToken(userId, session.page);
    console.log("[bsre] token after launch:", token ? "found ✓" : "NOT found ✗");

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

    if (new URL(s.page.url()).hostname.includes(BEID_HOST)) {
      await handleBeIDLogin(s.page);
      await s.page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    }

    // Re-cache token after navigation
    await cacheToken(userId, s.page);

    return { success: true, message: `Navigasi ke ${url} berhasil.` };
  }
);

export const getSessionStatus = query(
  type({ userId: "string" }),
  async ({ userId }) => ({
    ...sessionInfo(userId),
    hasToken: tokenStore.has(userId),
  })
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

export const fetchBsreUsers = command(
  type({
    userId: "string",
    search: "string?",
    start: "number?",
    length: "number?",
  }),
  async ({ userId, search = "", start = 0, length = 20 }) => {
    // Use cached token first (survives HMR / browser close)
    let authorization = tokenStore.get(userId);

    // Fallback: try reading from active page's localStorage
    if (!authorization) {
      const s = sessions.get(userId);
      if (s) {
        const token = await getAccessToken(s.page);
        if (token) {
          authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
          tokenStore.set(userId, authorization);
        }
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
      const res = await fetch(BSRE_USERS_API, {
        method: "POST",
        headers: {
          accept: "application/json, text/plain, */*",
          authorization,
          "content-type": "application/json;charset=UTF-8",
        },
        body: JSON.stringify({ search, start, length, filters: null }),
      });

      if (!res.ok) {
        // Token likely expired — clear it
        if (res.status === 401) tokenStore.delete(userId);
        return { success: false, message: `API error: ${res.status} ${res.statusText}`, data: null };
      }

      const data = await res.json();
      console.log("[bsre] users response keys:", Object.keys(data));

      const records = data?.data?.aaData ?? [];
      if (Array.isArray(records) && records.length > 0) {
        console.log(`[bsre] Fetching details for ${records.length} users...`);
        const detailedRecords = await Promise.all(
          records.map(async (user: any) => {
            if (!user?.id) return user;
            try {
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
                  ...detailData
                };
                return merged;
              }
            } catch (err) {
              console.error(`[bsre] Error fetching details for user ${user.id}:`, err);
            }
            return user;
          })
        );
        data.data.aaData = detailedRecords;
      }

      console.log("[bsre] users response data preview:", JSON.stringify(data).substring(0, 1000));
      return { success: true, data, total: data?.data?.records ?? data?.recordsTotal ?? data?.total ?? 0 };
    } catch (err: any) {
      return { success: false, message: err?.message ?? "Gagal fetch API.", data: null };
    }
  }
);
