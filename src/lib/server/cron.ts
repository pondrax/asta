import cron from "node-cron";
import { openSession, closeSession, cacheToken, tokenStore } from "./browser";
import { handleBeIDLogin } from "./browser";
import { fetchBsreUsers } from "$lib/remotes/bsre.remote";

const SYSTEM_USER_ID = "auto-sync";
const BSRE_URL = "https://portal-bsre.bssn.go.id/";

async function runSync() {
  console.log("[cron] Starting daily BSrE sync at", new Date().toISOString());

  try {
    if (!tokenStore.has(SYSTEM_USER_ID)) {
      console.log("[cron] No token found. Launching browser to get token...");
      const session = await openSession(SYSTEM_USER_ID);
      await session.page.goto(BSRE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });

      const BEID_HOST = "beid.bssn.go.id";
      if (new URL(session.page.url()).hostname.includes(BEID_HOST)) {
        await handleBeIDLogin(session.page);
        await session.page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      }

      await cacheToken(SYSTEM_USER_ID, session.page);
      console.log("[cron] Token cached:", tokenStore.has(SYSTEM_USER_ID) ? "OK" : "FAILED");
    }

    if (tokenStore.has(SYSTEM_USER_ID)) {
      const result = await fetchBsreUsers({ userId: SYSTEM_USER_ID });
      console.log("[cron] Sync result:", result?.success ? `OK (${result.total} users)` : "FAILED", result?.message);
    } else {
      console.error("[cron] Cannot sync: no token available");
    }
  } catch (err) {
    console.error("[cron] Sync failed:", err);
  } finally {
    await closeSession(SYSTEM_USER_ID);
  }
}

export function startCron() {
  cron.schedule("0 6 * * *", runSync, {
    timezone: "Asia/Jakarta",
  });
  console.log("[cron] BSrE auto-sync scheduled daily at 06:00 GMT+7");
}
