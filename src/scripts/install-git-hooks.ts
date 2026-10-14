/**
 * Install the repo's git hooks (currently just the `commit-msg` changelog
 * scaffold) into the local `.git/hooks` directory.
 *
 * Hooks are not tracked by git, so this runs from the `prepare` script after
 * `bun install` to keep every clone wired up. It is deliberately quiet and
 * never fails: outside a git checkout (CI, a packaged build) there is simply
 * nothing to install.
 *
 * Run manually: `bun run hooks:install`
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MARKER = "# changelog-commit-hook";

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

try {
  const dir = gitDir();
  if (!dir) process.exit(0);

  const hooksDir = resolve(ROOT, dir, "hooks");
  mkdirSync(hooksDir, { recursive: true });
  const hookPath = resolve(hooksDir, "commit-msg");

  if (existsSync(hookPath) && !readFileSync(hookPath, "utf8").includes(MARKER)) {
    console.warn(
      `hooks: ${hookPath} already exists and is not ours - leaving it untouched.`,
    );
    process.exit(0);
  }

  const hook = `#!/bin/sh
${MARKER}
"${process.execPath}" "$(git rev-parse --show-toplevel)/src/scripts/changelog-commit.ts" "$1" || exit 0
exit 0
`;

  writeFileSync(hookPath, hook);
  chmodSync(hookPath, 0o755);
  console.log(`hooks: installed commit-msg -> ${hookPath}`);
} catch (error) {
  console.warn(`hooks: skipped (${(error as Error).message})`);
}
process.exit(0);
