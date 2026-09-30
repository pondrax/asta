/**
 * Generate the changelog data block inside `src/lib/app/changelog.svelte.ts`
 * from `CHANGELOG.md`.
 *
 * The markdown file is the human-editable source of truth; this script is the
 * only thing that should ever write the generated region. The script replaces
 * the region between the two marker comments and leaves the rest of the target
 * file untouched, so hand-written helpers in that file are never clobbered.
 *
 * Run: `bun run changelog:build`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = join(ROOT, "CHANGELOG.md");
const TARGET = join(ROOT, "src/lib/app/changelog.svelte.ts");

const BEGIN = "// --- BEGIN GENERATED FROM CHANGELOG.md (bun run changelog:build) ---";
const END = "// --- END GENERATED ---";

/** Markdown label -> internal `ChangeKind`. */
const KINDS: Record<string, ChangeKind> = {
  Baru: "added",
  Diubah: "changed",
  Peningkatan: "improved",
  Perbaikan: "fixed",
};

/**
 * Audience label -> internal tier, keyed by lowercased label so the source can
 * write `Admin` or `admin` interchangeably.
 *
 * `Tamu` maps to `null` because a public entry must have *no* `audience` field
 * in the output. Writing it explicitly in the markdown is still allowed and
 * still means public.
 */
const AUDIENCE_LABEL: Record<string, ChangelogAudience | null> = {
  tamu: null,
  pengguna: "member",
  admin: "admin",
};

/**
 * Audience implied by the route a page lives under, used as the default when
 * an entry does not say otherwise. This mirrors the app's real access rules:
 * `/main*` is admin-only (`hooks.server.ts` 403s every other role), `/me*` and
 * `/profile` only exist for a signed-in account, and everything else works
 * signed-out.
 */
function audienceForRoute(route: string): ChangelogAudience {
  if (route === "*") return "guest";
  if (route === "/main" || route.startsWith("/main/")) return "admin";
  if (route === "/me" || route.startsWith("/me/") || route === "/profile") {
    return "member";
  }
  return "guest";
}

type ChangeKind = "added" | "changed" | "improved" | "fixed";
type ChangelogAudience = "guest" | "member" | "admin";

interface Change {
  kind: ChangeKind;
  text: string;
}

interface Entry {
  id: string;
  date: string;
  title: string;
  /** Route this entry belongs to, from its `Halaman:` line. */
  route: string;
  /** Human label for that route, from the same line. */
  label: string;
  version?: string;
  audience?: ChangelogAudience;
  changes: Change[];
}

interface Page {
  route: string;
  page: string;
  entries: Entry[];
}

/**
 * Every entry id carries its own date as a trailing `-YYYY-MM-DD`. Reading the
 * date out of the id means the markdown never states it twice, and the two
 * cannot drift apart.
 */
const DATE_SUFFIX = /-(\d{4}-\d{2}-\d{2})$/;

/** Collect problems and report them all at once, rather than failing on the first. */
const problems: string[] = [];

function fail(message: string) {
  problems.push(message);
}

/** True when a comment block is an entry header rather than prose. */
function isEntryMeta(text: string): boolean {
  // Must *begin* with `id:` — the file's own header comment documents the
  // format and contains the words "id" and "date" in prose, so a looser test
  // would misread the documentation as an entry.
  return /^id\s*:/.test(text);
}

/**
 * Drop markdown backslash escapes. Formatters escape `*` to `\*` (it would
 * otherwise read as emphasis), so the `*` route must be written `## \* - ...`
 * in the markdown and unescaped back to `*` here.
 */
function unescape(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!>])/g, "$1");
}

/**
 * Read `Key: value` lines that sit between a `### Title` and its change list.
 *
 * The id stays in a comment because it is machine bookkeeping; everything else
 * is plain text so a reader of `CHANGELOG.md` can see where a change landed,
 * when, and who it is for. Keys are matched case-insensitively so the
 * Indonesian and English spellings both work.
 */
const VISIBLE_META = /^([A-Za-z]+)\s*:\s*(.+)$/;

function applyVisibleMeta(
  entry: Entry,
  key: string,
  value: string,
  lineNo: number,
  groupDate: string,
) {
  const k = key.toLowerCase();

  if (k === "halaman" || k === "page") {
    // Same `route - Label` shape the old section headings used: split on the
    // first " - " so a hyphen inside the route (`/main/portal-bsre`) survives.
    const body = value.trim();
    const sep = body.indexOf(" - ");
    if (sep === -1) {
      fail(
        `line ${lineNo}: Halaman must be "/route - Label", got "${body}"`,
      );
      return;
    }
    entry.route = unescape(body.slice(0, sep).trim());
    entry.label = unescape(body.slice(sep + 3).trim());
    if (!entry.route || !entry.label) {
      fail(`line ${lineNo}: Halaman needs both a route and a label`);
      return;
    }
    // Cross-check: an entry tagged `/main/*` claiming to be for signed-out
    // visitors is almost certainly a typo, since `hooks.server.ts` 403s that
    // whole prefix. Warn loudly rather than silently showing it to the public.
    const implied = audienceForRoute(entry.route);
    if (entry.audience && implied === "guest" && entry.audience !== "guest") {
      fail(
        `line ${lineNo}: Halaman "${entry.route}" is public (${implied}), ` +
          `but Audiens says "${entry.audience}"`,
      );
    }
    return;
  }

  if (k === "tanggal" || k === "date") {
    // The date lives in the `## YYYY-MM-DD` heading, so a per-entry line is
    // redundant; it is still accepted as long as it agrees with that heading.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      fail(`line ${lineNo}: Tanggal "${value}" is not YYYY-MM-DD`);
      return;
    }
    if (groupDate && value !== groupDate) {
      fail(
        `line ${lineNo}: Tanggal "${value}" disagrees with the date heading ` +
          `"${groupDate}" this entry sits under`,
      );
    }
    return;
  }

  if (k === "audiens" || k === "audience") {
    const label = AUDIENCE_LABEL[value.trim().toLowerCase()];
    if (label === undefined) {
      fail(
        `line ${lineNo}: unknown Audiens "${value}" ` +
          `(expected Tamu, Pengguna, or Admin)`,
      );
      return;
    }
    // `Tamu` is expressed by *omitting* the field, so a public entry has no
    // `audience` in the output even when the markdown says it explicitly.
    if (label) entry.audience = label;
    return;
  }

  if (k === "versi" || k === "version") {
    entry.version = value.trim();
  }
}

function parseMetadata(raw: string, lineNo: number): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const part of raw.split("|")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    meta[part.slice(0, idx).trim().toLowerCase()] = part
      .slice(idx + 1)
      .trim();
  }
  if (!meta.id) fail(`line ${lineNo}: entry comment is missing "id"`);
  return meta;
}

/**
 * Read the date-grouped entry list and bucket it by `Halaman:`.
 *
 * The markdown groups entries under `## YYYY-MM-DD` headings, newest first; the
 * per-page grouping the popup needs is derived here, so an author only ever
 * adds a block under a date heading. Pages come out in the order their newest
 * entry first appears, which keeps the most recently touched page first.
 */
function parse(): Page[] {
  const lines = readFileSync(SOURCE, "utf8").split(/\r?\n/);

  const flat: Entry[] = [];
  let entry: Entry | null = null;
  /** Date of the `## YYYY-MM-DD` group currently being read. */
  let groupDate = "";
  let prevGroupDate = "";

  // HTML comments are either the file header (prose, to be skipped) or an
  // entry's id. Both are "inside a comment", so one flag covers them; `comment`
  // holds the text of the block currently being read.
  let inComment = false;
  let comment = "";
  let commentLine = 0;

  const flushComment = () => {
    if (!inComment) return;
    inComment = false;
    const text = comment.trim();
    comment = "";
    // The file's header block and any other prose comment are skipped; only a
    // comment that starts with `id:` is an entry header.
    if (!isEntryMeta(text)) return;
    if (!entry) {
      fail(`line ${commentLine}: entry metadata appears before any "### Title"`);
      return;
    }
    const meta = parseMetadata(text, commentLine);
    // A second id comment under the same `### Title` means two entries were
    // written under one heading. Without this the new id and its `Halaman:`
    // would silently overwrite the first block's, merging two entries into one.
    if (entry.id) {
      fail(
        `line ${commentLine}: entry "${entry.title}" already has id ` +
          `"${entry.id}". Every id needs its own "### Title".`,
      );
      return;
    }
    entry.id = meta.id ?? "";
    if (!entry.id) return;
    if (!DATE_SUFFIX.test(entry.id)) {
      fail(
        `line ${commentLine}: id "${entry.id}" must end in -YYYY-MM-DD ` +
          `(that suffix is the entry date)`,
      );
      return;
    }
    // The id suffix and the date heading must agree; neither alone is trusted.
    const fromId = entry.id.match(DATE_SUFFIX)![1];
    if (groupDate && fromId !== groupDate) {
      fail(
        `line ${commentLine}: id "${entry.id}" implies ${fromId}, but the ` +
          `entry sits under the "${groupDate}" heading`,
      );
      return;
    }
    entry.date = groupDate || fromId;
  };

  lines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    const line = rawLine.trimEnd();

    if (inComment) {
      if (line.includes("-->")) {
        comment += " " + line.slice(0, line.indexOf("-->"));
        flushComment();
        return;
      }
      comment += " " + line;
      return;
    }

    const open = line.indexOf("<!--");
    if (open !== -1) {
      inComment = true;
      commentLine = lineNo;
      const close = line.indexOf("-->", open);
      if (close !== -1) {
        comment = line.slice(open + 4, close);
        flushComment();
      } else {
        comment = line.slice(open + 4);
      }
      return;
    }

    // `## YYYY-MM-DD` opens a date group; every entry below it inherits the
    // date, so it is written once per group rather than per entry.
    if (line.startsWith("## ")) {
      flushComment();
      const body = line.slice(3).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body)) {
        fail(
          `line ${lineNo}: heading must be a "## YYYY-MM-DD" date, got "${body}"`,
        );
        return;
      }
      // Newest first, like every changelog.
      if (prevGroupDate && body > prevGroupDate) {
        fail(
          `line ${lineNo}: date group "${body}" comes after "${prevGroupDate}". ` +
            `Move it to the top so the newest group is first.`,
        );
      }
      prevGroupDate = body;
      groupDate = body;
      entry = null;
      return;
    }

    if (line.startsWith("### ")) {
      flushComment();
      if (!groupDate) {
        fail(
          `line ${lineNo}: "### Title" appears before any "## YYYY-MM-DD" heading`,
        );
        return;
      }
      entry = {
        id: "",
        date: "",
        title: line.slice(4).trim(),
        route: "",
        label: "",
        changes: [],
      };
      flat.push(entry);
      return;
    }

    // `Halaman:`, `Audiens:`, `Versi:` — visible metadata for the current
    // entry. Only recognised inside an entry, and only before the first change
    // bullet, so a stray `Note: ...` line later in a change is not swallowed.
    if (entry && !entry.changes.length) {
      const visible = line.match(VISIBLE_META);
      if (visible) {
        applyVisibleMeta(entry, visible[1], visible[2].trim(), lineNo, groupDate);
        return;
      }
    }

    // `- **Label** - text`
    const change = line.match(/^-\s+\*\*(.+?)\*\*\s*-\s*(.+)$/);
    if (change) {
      flushComment();
      if (!entry) {
        fail(`line ${lineNo}: change bullet appears before any "### Title"`);
        return;
      }
      const [, label, text] = change;
      const kind = KINDS[label.trim()];
      if (!kind) {
        fail(
          `line ${lineNo}: unknown change kind "${label.trim()}" ` +
            `(expected one of ${Object.keys(KINDS).join(", ")})`,
        );
        return;
      }
      entry.changes.push({ kind, text: text.trim() });
      return;
    }

    flushComment();
  });

  flushComment();

  for (const e of flat) {
    if (!e.changes.length) {
      fail(`entry "${e.id || e.title}" has no changes`);
    }
    if (!e.route) {
      fail(
        `entry "${e.id || e.title}" has no "Halaman:" line, ` +
          `so there is no page to file it under`,
      );
    }
  }

  const seen = new Map<string, string>();
  for (const e of flat) {
    if (!e.id) continue;
    const prev = seen.get(e.id);
    if (prev) {
      fail(`duplicate entry id "${e.id}" (already used by ${prev})`);
    }
    seen.set(e.id, `${e.route} / ${e.title}`);
  }

  // Group by route. `Map` preserves insertion order, so pages come out in the
  // order their newest entry first appears in the (date-grouped) file, and each
  // page's own entries stay newest-first for the same reason. Ordering of the
  // date groups themselves is enforced where they are read.
  const pages: Page[] = [];
  const byRoute = new Map<string, Page>();
  for (const e of flat) {
    if (!e.route) continue;
    let page = byRoute.get(e.route);
    if (!page) {
      page = { route: e.route, page: e.label, entries: [] };
      byRoute.set(e.route, page);
      pages.push(page);
    } else if (page.page !== e.label) {
      fail(
        `route "${e.route}" is labelled "${page.page}" here but "${e.label}" ` +
          `elsewhere - use one label per route so the popup heading is stable`,
      );
    }
    page.entries.push(e);
  }

  // Checked here rather than in `render()`: `render()` runs *after* the
  // problems list has already been reported, so a `fail()` there would be
  // silently dropped and the file would be written with an empty fallback.
  if (!pages.some((p) => p.route === "*")) {
    fail(
      "no fallback page found - add an entry with " +
        '"Halaman: \\\\* - Label" so pages without their own notes still get some',
    );
  }

  return pages;
}

/** Emit the two exported constants with stable, readable formatting. */
function render(pages: Page[]): string {
  // `parse()` has already guaranteed a `*` page exists.
  const global = pages.find((p) => p.route === "*")!;
  const scoped = pages.filter((p) => p.route !== "*");

  const renderEntry = (e: Entry, indent: string): string => {
    const lines: string[] = [];
    lines.push(`${indent}{`);
    lines.push(`${indent}  id: ${JSON.stringify(e.id)},`);
    lines.push(`${indent}  date: ${JSON.stringify(e.date)},`);
    lines.push(`${indent}  title: ${JSON.stringify(e.title)},`);
    if (e.version) lines.push(`${indent}  version: ${JSON.stringify(e.version)},`);
    if (e.audience) {
      lines.push(`${indent}  audience: ${JSON.stringify(e.audience)},`);
    }
    lines.push(`${indent}  changes: [`);
    for (const c of e.changes) {
      lines.push(`${indent}    {`);
      lines.push(`${indent}      kind: ${JSON.stringify(c.kind)},`);
      lines.push(`${indent}      text: ${JSON.stringify(c.text)},`);
      lines.push(`${indent}    },`);
    }
    lines.push(`${indent}  ],`);
    lines.push(`${indent}},`);
    return lines.join("\n");
  };

  const renderPage = (p: Page, indent: string): string => {
    const lines: string[] = [];
    lines.push(`${indent}{`);
    lines.push(`${indent}  route: ${JSON.stringify(p.route)},`);
    lines.push(`${indent}  page: ${JSON.stringify(p.page)},`);
    lines.push(`${indent}  entries: [`);
    for (const e of p.entries) lines.push(renderEntry(e, indent + "    "));
    lines.push(`${indent}  ],`);
    lines.push(`${indent}},`);
    return lines.join("\n");
  };

  const out: string[] = [];
  out.push("/**");
  out.push(" * Changelog data generated from `CHANGELOG.md`.");
  out.push(" *");
  out.push(" * Do not edit below the marker by hand - run `bun run changelog:build`");
  out.push(" * instead. Entries are grouped by the `Halaman:` line in the markdown,");
  out.push(" * so adding a note there is the whole workflow.");
  out.push(" */");

  out.push("export const PAGE_CHANGELOGS: PageChangelog[] = [");
  for (const p of scoped) out.push(renderPage(p, "  "));
  out.push("];");

  out.push("");
  out.push("/** Shown on pages with no page-specific set of their own. */");
  out.push("export const GLOBAL_CHANGELOG: PageChangelog =");
  // A bare `const x = {...}` initializer must end in `;`, not the `,` that
  // `renderPage` produces for its use as an array element.
  out.push(renderPage(global, "  ").replace(/,$/, ";"));

  return out.join("\n");
}

function main() {
  const pages = parse();

  if (problems.length) {
    console.error(`\n${problems.length} problem(s) in CHANGELOG.md:\n`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error("\nNothing was written.\n");
    process.exit(1);
  }

  const target = readFileSync(TARGET, "utf8");
  const beginIdx = target.indexOf(BEGIN);
  const endIdx = target.indexOf(END);

  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    console.error(
      `\nCould not find the generated region in ${TARGET}.\n` +
        `Expected both markers:\n  ${BEGIN}\n  ${END}\n`,
    );
    process.exit(1);
  }

  const next =
    target.slice(0, beginIdx + BEGIN.length) +
    "\n" +
    render(pages) +
    "\n" +
    // Drop the blank line the marker used to be followed by, so re-running
    // the build does not accumulate blank lines at the seam.
    target.slice(endIdx).replace(/^\n+/, "\n");

  if (next === target) {
    const count = pages.reduce((n, p) => n + p.entries.length, 0);
    console.log(`changelog: already up to date (${pages.length} pages, ${count} entries)`);
    return;
  }

  writeFileSync(TARGET, next);
  const count = pages.reduce((n, p) => n + p.entries.length, 0);
  console.log(`changelog: wrote ${pages.length} pages, ${count} entries -> ${TARGET}`);
}

main();
