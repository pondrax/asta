import cron from "node-cron";
import { closeSession } from "./browser";
import { fetchBsreUsersCore } from "./bsre-sync";

const SYSTEM_USER_ID = "auto-sync";

async function runSync() {
  console.log("[cron] Starting daily BSrE sync at", new Date().toISOString());

  try {
    // NOTE: must NOT use the remote `command()` wrapper from bsre.remote —
    // it requires an active request context and throws
    // "Could not get the request store" when called from node-cron.
    // fetchBsreUsersCore handles token acquisition internally via acquireToken.
    const result = await fetchBsreUsersCore({ userId: SYSTEM_USER_ID });
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
