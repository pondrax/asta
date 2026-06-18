import cron from "node-cron";
import { closeSession } from "./browser";
import { fetchBsreUsers } from "$lib/remotes/bsre.remote";

const SYSTEM_USER_ID = "auto-sync";

async function runSync() {
  console.log("[cron] Starting daily BSrE sync at", new Date().toISOString());

  try {
    // fetchBsreUsers handles token acquisition internally via acquireToken,
    // so we don't need to duplicate session/browser logic here.
    const result = await fetchBsreUsers({ userId: SYSTEM_USER_ID });
    console.log(
      "[cron] Sync result:",
      result?.success ? `OK (${result.total} users)` : "FAILED",
      result?.message,
    );
  } catch (err) {
    console.error("[cron] Sync failed:", err);
  } finally {
    // Clean up any browser session left open by acquireToken / fetchBsreUsers
    await closeSession(SYSTEM_USER_ID);
  }
}

export function startCron() {
  cron.schedule("0 6 * * *", runSync, {
    timezone: "Asia/Jakarta",
  });
  console.log("[cron] BSrE auto-sync scheduled daily at 06:00 GMT+7");
}
