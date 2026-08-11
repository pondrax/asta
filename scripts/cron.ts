/**
 * Manual cron trigger — runs the same sync the daily node-cron job would run,
 * but outside any HTTP request.
 *
 * IMPORTANT: must NOT use the remote `command()`/`query()` wrappers from
 * `$app/server` (bsre.remote) — they require an active request context and
 * throw "Could not get the request store" when called from cron. This script
 * calls the core sync functions in `src/lib/server/bsre-sync.ts` directly.
 *
 * Usage:
 *   bun run cron                 # run every registered sync
 *   bun run cron -- portal-bsre  # run one sync
 */
import { closeSession } from "../src/lib/server/browser";
import { fetchBsreUsersCore } from "../src/lib/server/bsre-sync";

const SYSTEM_USER_ID = "auto-sync";

type SyncResult = { success: boolean; total?: number; message?: string; data?: unknown };

const SYNC_ACTIONS: Record<string, () => Promise<SyncResult>> = {
  "portal-bsre": () => fetchBsreUsersCore({ userId: SYSTEM_USER_ID }),
};

async function main() {
  const [, , ...args] = process.argv;
  const requested = args.length > 0 ? args : Object.keys(SYNC_ACTIONS);

  for (const name of requested) {
    const action = SYNC_ACTIONS[name];
    if (!action) {
      console.error(`[cron] Unknown sync "${name}". Available: ${Object.keys(SYNC_ACTIONS).join(", ")}`);
      process.exitCode = 1;
      continue;
    }

    console.log(`[cron] Running "${name}" sync at`, new Date().toISOString());
    try {
      const result = await action();
      console.log(
        "[cron] Sync result:",
        result?.success ? `OK (${result.total ?? 0} users)` : "FAILED",
        result?.message ?? "",
      );
    } catch (err) {
      console.error("[cron] Sync failed:", err);
    } finally {
      // Clean up any browser session left open by acquireToken / fetchBsreUsersCore
      await closeSession(SYSTEM_USER_ID);
    }
  }
}

main().catch((err) => {
  console.error("[cron] Fatal error:", err);
  process.exit(1);
});
