import { command, query } from "$app/server";
import { type } from "arktype";
import { db } from "$lib/server/db";
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
      await session.page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => { });
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
      await s.page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => { });
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
          await Promise.all(
            records.map(async (user: any) => {
              if (!user?.id) return;
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
                  await db.query.bsreUsers.upsert({
                    data: { id: user.id, ...record },
                    update: { ...record, fetchedAt: new Date().toISOString() },
                  });
                }
              } catch (err) {
                console.error(`[bsre] Error fetching details for user ${user.id}:`, err);
              }
            })
          );
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
