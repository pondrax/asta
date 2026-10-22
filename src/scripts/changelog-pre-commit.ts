/**
 * Keep `CHANGELOG.md` in step with each commit, inside the same commit.
 *
 * Installed as the `pre-commit` git hook (see `install-git-hooks.ts`). Git only
 * folds index changes made by `pre-commit` into the commit — staging done in
 * `commit-msg` / `prepare-commit-msg` is ignored — so the work has to happen
 * here.
 *
 *  - If `CHANGELOG.md` is already part of the commit, the generated block is
 *    regenerated and re-staged so it can never drift from the markdown.
 *  - Otherwise a draft entry is scaffolded from the pending commit message and
 *    the routes the staged files live under, the block is regenerated, and both
 *    files are staged so the entry rides along with the commit.
 *
 * The pending message is not written to disk yet when `pre-commit` runs, so the
 * installed hook passes the parent `git commit` command line down through
 * `GIT_HOOK_CMDLINE` and the message is read from there. Interactive
 * editor commits have no `-m` on the command line, so those are only kept in
 * sync, never scaffolded.
 *
 * The hook never blocks a commit: failures are printed and swallowed, and it
 * always exits 0. Non user-facing commit types (`chore`, `docs`, `test`, ...)
 * and merges/rebase/cherry-pick are skipped with a reminder instead.
 *
 * Run manually: `GIT_HOOK_CMDLINE='git commit -m "feat: x"' bun src/scripts/changelog-pre-commit.ts`
 * Preview only:  add `--dry-run`
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CHANGELOG = join(ROOT, "CHANGELOG.md");
const PACKAGE = join(ROOT, "package.json");
const GENERATED_REL = "src/lib/app/changelog.svelte.ts";
const BUILD = join(ROOT, "src/scripts/build-changelog.ts");

const DRY_RUN = process.argv.includes("--dry-run");

/** Commit types that do not usually produce user-visible notes. */
const SKIP_TYPES = new Set([
  "chore",
  "docs",
  "style",
  "test",
  "ci",
  "build",
  "revert",
]);

/** Conventional-commit type -> changelog change label. */
const KIND_BY_TYPE: Record<string, string> = {
  feat: "Fitur Baru",
  fix: "Perbaikan",
  perf: "Performa",
  refactor: "Penyempurnaan",
};

const CONVENTIONAL = /^([A-Za-z]+)(?:\([^)]*\))?!?:\s*/;

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function gitQuiet(args: string[]): string {
  try {
    return git(args);
  } catch {
    return "";
  }
}

function localDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50) || "update"
  );
}

/**
 * Recover the pending commit message from the parent `git commit` command line.
 *
 * The args come from `ps`, so quoting is already gone; a `-m` value is taken as
 * every following token up to the next flag-looking one. `-F`/`--file` is read
 * from disk. Returns null when no message can be determined (e.g. an editor
 * commit), which disables scaffolding.
 */
function pendingMessage(): string | null {
  const cmdline = process.env.GIT_HOOK_CMDLINE ?? "";
  if (!cmdline) return null;

  const tokens = cmdline.split(/\s+/);
  const commitAt = tokens.indexOf("commit");
  const rest = tokens.slice(commitAt === -1 ? 0 : commitAt + 1);
  const isFlag = (t: string) => /^-{1,2}[A-Za-z]/.test(t);
  const parts: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === "--message" || (token.startsWith("-") && !token.startsWith("--") && token.includes("m"))) {
      i++;
      const chunk: string[] = [];
      while (i < rest.length && !isFlag(rest[i])) chunk.push(rest[i++]);
      i--;
      parts.push(chunk.join(" "));
    } else if (token === "-F" || token === "--file") {
      const file = rest[++i];
      try {
        return readFileSync(file, "utf8");
      } catch {
        return null;
      }
    }
  }

  const message = parts.filter(Boolean).join("\n\n").trim();
  return message || null;
}

/** Map a staged file path to the URL route it belongs to, or null. */
function routeFromPath(path: string): string | null {
  const prefix = "src/routes/";
  if (!path.startsWith(prefix)) return null;
  const segments = path.slice(prefix.length).split("/");
  while (
    segments.length &&
    (segments[segments.length - 1].includes(".") ||
      segments[segments.length - 1].startsWith("+"))
  ) {
    segments.pop();
  }
  const route = segments
    .filter((s) => s && !(s.startsWith("(") && s.endsWith(")")))
    .join("/");
  return "/" + route;
}

function audienceFor(route: string): string {
  if (route === "/main" || route.startsWith("/main/")) return "Admin";
  if (route === "/me" || route.startsWith("/me/") || route === "/profile") {
    return "Pengguna";
  }
  return "Tamu";
}

function deriveLabel(route: string): string {
  if (route === "*") return "Tapak Astà";
  const segments = route.split("/").filter(Boolean);
  const last =
    [...segments].reverse().find((s) => !s.startsWith("[") && s !== "_") ??
    segments.at(-1) ??
    "";
  return (
    last
      .split(/[-_]/)
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ") || "Beranda"
  );
}

/** `Halaman: /route - Label` pairs already used, so labels stay consistent. */
function routeLabels(markdown: string): Map<string, string> {
  const labels = new Map<string, string>();
  for (const match of markdown.matchAll(/^Halaman:\s*(\S+)\s*-\s*(.+)$/gm)) {
    labels.set(match[1].replace(/\\/g, ""), match[2].trim());
  }
  return labels;
}

function firstDateHeading(lines: string[]): number {
  return lines.findIndex((l) => /^## \d{4}-\d{2}-\d{2}\s*$/.test(l));
}

function build(): { ok: boolean; output: string } {
  try {
    const output = execFileSync(process.execPath, [BUILD], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
    });
    return { ok: true, output };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      output: `${err.stdout ?? ""}${err.stderr ?? ""}${err.message ?? ""}`.trim(),
    };
  }
}

/** Rebuild the generated block and stage both files so they join the commit. */
function regenerate(): boolean {
  const { ok, output } = build();
  if (!ok) {
    console.warn("changelog: build failed, entry left for you to fix:\n" + output);
    return false;
  }
  git(["add", "CHANGELOG.md", GENERATED_REL]);
  if (output) console.log(output.trim());
  return true;
}

/** Bump the patch version in `package.json` and stage it to join the commit. */
function bumpVersion(): void {
  try {
    const raw = readFileSync(PACKAGE, "utf8");
    const replaced = raw.replace(
      /("version"\s*:\s*")(\d+)\.(\d+)\.(\d+)(")/,
      (match, head, major, minor, patch, tail) =>
        `${head}${major}.${minor}.${Number(patch) + 1}${tail}`,
    );
    if (replaced === raw) return;
    writeFileSync(PACKAGE, replaced);
    git(["add", "package.json"]);
    const { version } = JSON.parse(replaced) as { version?: string };
    console.log(`version: bumped to ${version ?? "?"}`);
  } catch (error) {
    console.warn(`version: skipped (${(error as Error).message})`);
  }
}

/** Don't touch the index while git is replaying commits. */
function inProgress(): boolean {
  for (const marker of ["MERGE_HEAD", "rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD", "REVERT_HEAD"]) {
    if (gitQuiet(["rev-parse", "-q", "--verify", marker]).trim()) return true;
  }
  return false;
}

function main() {
  if (inProgress()) return;

  const staged = gitQuiet(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const changelogStaged = staged.includes("CHANGELOG.md");

  // Nothing staged (e.g. amending only the message) -> nothing to do.
  if (!staged.length) return;

  // Bump the patch version with every commit so the build tracks it.
  if (!DRY_RUN) bumpVersion();

  // Hand-edited markdown -> just keep the generated block in sync.
  if (changelogStaged) {
    regenerate();
    return;
  }

  // Leave a hand-edited, not-yet-staged CHANGELOG.md alone.
  if (gitQuiet(["diff", "--name-only", "--", "CHANGELOG.md"]).trim()) {
    console.log("changelog: CHANGELOG.md has unstaged edits - skipping draft.");
    return;
  }

  const raw = pendingMessage();
  if (!raw) {
    console.log(
      "changelog: no draft added (commit message not readable at pre-commit).",
    );
    return;
  }

  const lines = raw.split(/\r?\n/);
  const subjectIndex = lines.findIndex((l) => l.trim() && !l.startsWith("#"));
  if (subjectIndex === -1) return;
  const subject = lines[subjectIndex].trim();

  if (/^Merge\b/i.test(subject)) return;
  if (/\[(?:skip[- ]?changelog|changelog[- ]?skip)\]/i.test(raw)) return;

  const type = (subject.match(CONVENTIONAL)?.[1] ?? "").toLowerCase();
  if (SKIP_TYPES.has(type)) {
    console.log(
      `changelog: no entry added for "${type}" commit - add one if it is user-facing.`,
    );
    return;
  }

  const summary = (subject.replace(CONVENTIONAL, "").trim() || subject).replace(
    /\s+/g,
    " ",
  );
  const kind = KIND_BY_TYPE[type] ?? "Perubahan";
  const body = lines
    .slice(subjectIndex + 1)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !l.startsWith("#") &&
        !/^(co-authored-by|signed-off-by|reviewed-by|refs|see also):/i.test(l),
    );

  // Pick the route the bulk of the staged files live under.
  const counts = new Map<string, number>();
  for (const file of staged) {
    const route = routeFromPath(file);
    if (route) counts.set(route, (counts.get(route) ?? 0) + 1);
  }
  let route = "*";
  let best = 0;
  for (const [candidate, count] of counts) {
    if (count > best || (count === best && candidate.length > route.length)) {
      route = candidate;
      best = count;
    }
  }

  const markdown = readFileSync(CHANGELOG, "utf8");
  const label = routeLabels(markdown).get(route) ?? deriveLabel(route);
  const audience = audienceFor(route);
  const title = summary.charAt(0).toUpperCase() + summary.slice(1);

  const date = localDate();
  const existingIds = new Set(
    [...markdown.matchAll(/<!--\s*id:\s*([\w-]+)\s*-->/g)].map((m) => m[1]),
  );
  const slug = slugify(summary);
  let id = `${slug}-${date}`;
  for (let n = 2; existingIds.has(id); n++) id = `${slug}-${n}-${date}`;

  const entry = [
    `### ${title}`,
    "",
    `<!-- id: ${id} -->`,
    "",
    `Halaman: ${route === "*" ? "\\*" : route} - ${label}`,
    `Audiens: ${audience}`,
    "",
    `- **${kind}** - ${summary}`,
    ...body.map((text) => `- **${kind}** - ${text}`),
  ];

  if (DRY_RUN) {
    console.log(`changelog (dry run):\n\n${entry.join("\n")}\n`);
    return;
  }

  const mdLines = markdown.split(/\r?\n/);
  const headingIndex = firstDateHeading(mdLines);
  if (headingIndex === -1) {
    console.warn("changelog: no '## YYYY-MM-DD' heading found; nothing added.");
    return;
  }
  const topDate = mdLines[headingIndex].slice(3).trim();

  if (topDate === date) {
    const at = mdLines[headingIndex + 1] === "" ? headingIndex + 2 : headingIndex + 1;
    mdLines.splice(at, 0, ...entry, "");
  } else {
    mdLines.splice(headingIndex, 0, `## ${date}`, "", ...entry, "");
  }

  writeFileSync(CHANGELOG, mdLines.join("\n"));

  if (regenerate()) {
    console.log(`changelog: drafted "${title}" under ${route} (${date}).`);
  } else {
    gitQuiet(["checkout", "--", "CHANGELOG.md"]);
    console.warn(
      "changelog: draft discarded (build failed) - add a note by hand and run `bun run changelog:build`.",
    );
  }
}

try {
  main();
} catch (error) {
  console.warn(`changelog: skipped (${(error as Error).message})`);
}
process.exit(0);
