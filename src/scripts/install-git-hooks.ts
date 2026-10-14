/**
 * Install the repo's git hooks into the local `.git/hooks` directory.
 *
 * There is a single `pre-commit` hook that keeps `CHANGELOG.md` and its
 * generated block in step with each commit (see `changelog-pre-commit.ts`).
 *
 * Hooks are not tracked by git, so this runs from the `prepare` script after
 * `bun install` to keep every clone wired up. It is deliberately quiet and
 * never fails: outside a git checkout (CI, a packaged build) there is simply
 * nothing to install.
 *
 * Run manually: `bun run hooks:install`
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MARKER = "# changelog-pre-commit-hook";
const OLD_COMMIT_MSG_MARKER = "# changelog-commit-hook";

function gitDir(): string | null {
  try {
    const out = execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}

/** Write a hook, refusing to clobber one we did not create. */
function install(hooksDir: string, name: string, body: string) {
  const hookPath = resolve(hooksDir, name);
  if (existsSync(hookPath) && !readFileSync(hookPath, "utf8").includes(MARKER)) {
    console.warn(
      `hooks: ${hookPath} already exists and is not ours - leaving it untouched.`,
    );
    return;
  }
  writeFileSync(hookPath, body);
  chmodSync(hookPath, 0o755);
  console.log(`hooks: installed ${name} -> ${hookPath}`);
}

try {
  const dir = gitDir();
  if (!dir) process.exit(0);

  const hooksDir = resolve(ROOT, dir, "hooks");
  mkdirSync(hooksDir, { recursive: true });

  // Retire the old commit-msg approach: staging there is ignored by git, so
  // the generated entry never actually made it into the commit.
  const oldHook = resolve(hooksDir, "commit-msg");
  if (existsSync(oldHook) && readFileSync(oldHook, "utf8").includes(OLD_COMMIT_MSG_MARKER)) {
    rmSync(oldHook);
    console.log(`hooks: removed obsolete commit-msg -> ${oldHook}`);
  }

  // `GIT_HOOK_CMDLINE` carries the parent `git commit` command line down to the
  // script, which recovers the pending (not-yet-on-disk) commit message from it.
  const body = `#!/bin/sh
${MARKER}
GIT_HOOK_CMDLINE="$(ps -ww -o args= -p $PPID 2>/dev/null)" exec "${process.execPath}" "$(git rev-parse --show-toplevel)/src/scripts/changelog-pre-commit.ts"
`;
  install(hooksDir, "pre-commit", body);
} catch (error) {
  console.warn(`hooks: skipped (${(error as Error).message})`);
}
process.exit(0);
