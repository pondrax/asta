/**
 * Tests for the generated changelog data.
 *
 * The data in `changelog.svelte.ts` is machine-written by
 * `src/scripts/build-changelog.ts` from `CHANGELOG.md`, so these tests guard
 * the contract the popup depends on rather than any particular entry.
 */
import { describe, expect, it } from "vitest";
import {
  AUDIENCE_INFO,
  CHANGE_STYLES,
  GLOBAL_CHANGELOG,
  PAGE_CHANGELOGS,
  audienceForRole,
  canViewerSee,
  getAllEntries,
  getChangelogFor,
  visibleEntries,
} from "./lib/app/changelog.svelte";

const all = getAllEntries().map((r) => r.entry);

describe("generated data", () => {
  it("has pages and entries", () => {
    expect(PAGE_CHANGELOGS.length).toBeGreaterThan(0);
    expect(all.length).toBeGreaterThan(0);
  });

  it("gives every page a route and a human label", () => {
    for (const p of PAGE_CHANGELOGS) {
      expect(p.route.length).toBeGreaterThan(0);
      expect(p.page.length).toBeGreaterThan(0);
      expect(p.entries.length).toBeGreaterThan(0);
    }
    expect(GLOBAL_CHANGELOG.route).toBe("*");
    expect(GLOBAL_CHANGELOG.entries.length).toBeGreaterThan(0);
  });

  it("uses unique ids that all end in their date", () => {
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    for (const e of all) expect(e.id).toMatch(/-\d{4}-\d{2}-\d{2}$/);
    for (const e of all) expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("gives every entry a title and at least one change", () => {
    for (const e of all) {
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.changes.length).toBeGreaterThan(0);
      for (const c of e.changes) expect(c.kind in CHANGE_STYLES).toBe(true);
    }
  });

  it("only uses known audiences", () => {
    for (const e of all) {
      if (e.audience !== undefined) expect(e.audience in AUDIENCE_INFO).toBe(true);
    }
  });

  it("orders each page newest first", () => {
    for (const p of [...PAGE_CHANGELOGS, GLOBAL_CHANGELOG]) {
      const dates = p.entries.map((e) => e.date);
      expect(dates).toEqual([...dates].sort().reverse());
    }
  });
});

describe("page resolution", () => {
  it("matches the longest route prefix", () => {
    expect(getChangelogFor("/me/documents").route).toBe("/me/documents");
    expect(getChangelogFor("/me").route).toBe("/me");
    expect(getChangelogFor("/me/anything/deep").route).toBe("/me");
    expect(getChangelogFor("/main/portal-bsre/x").route).toBe("/main/portal-bsre");
  });

  it("prefers an exact match over a prefix", () => {
    expect(getChangelogFor("/")).toBe(PAGE_CHANGELOGS.find((p) => p.route === "/"));
  });

  it("falls back to the global page for unknown paths", () => {
    expect(getChangelogFor("/totally/unknown")).toBe(GLOBAL_CHANGELOG);
  });

  it("ignores a trailing slash", () => {
    expect(getChangelogFor("/me/")).toBe(getChangelogFor("/me"));
    expect(getChangelogFor("/")).toBe(getChangelogFor(""));
  });
});

describe("audience filtering", () => {
  it("ranks the tiers", () => {
    expect(AUDIENCE_INFO.guest.rank).toBeLessThan(AUDIENCE_INFO.member.rank);
    expect(AUDIENCE_INFO.member.rank).toBeLessThan(AUDIENCE_INFO.admin.rank);
    expect(audienceForRole(null)).toBe("guest");
    expect(audienceForRole("admin")).toBe("admin");
  });

  it("hides admin notes from everyone below admin", () => {
    const adminOnly = all.filter((e) => e.audience === "admin");
    expect(adminOnly.length).toBeGreaterThan(0);
    for (const e of adminOnly) {
      expect(canViewerSee(e, "guest")).toBe(false);
      expect(canViewerSee(e, "member")).toBe(false);
      expect(canViewerSee(e, "admin")).toBe(true);
    }
  });

  it("treats an omitted audience as guest-visible", () => {
    for (const e of all.filter((x) => x.audience === undefined)) {
      expect(canViewerSee(e, "guest")).toBe(true);
    }
  });

  it("agrees between canViewerSee and visibleEntries", () => {
    for (const tier of ["guest", "member", "admin"] as const) {
      for (const p of [...PAGE_CHANGELOGS, GLOBAL_CHANGELOG]) {
        expect(visibleEntries(p, tier)).toEqual(
          p.entries.filter((e) => canViewerSee(e, tier)),
        );
      }
    }
  });

  it("shows a member nothing on an admin-only page", () => {
    const adminPage = PAGE_CHANGELOGS.find((p) => p.route === "/main/users");
    expect(adminPage).toBeDefined();
    expect(visibleEntries(adminPage!, "member")).toHaveLength(0);
    expect(visibleEntries(adminPage!, "admin").length).toBeGreaterThan(0);
  });

  it("keeps every /main page admin-only", () => {
    for (const p of PAGE_CHANGELOGS.filter((x) => x.route.startsWith("/main"))) {
      for (const e of p.entries) expect(e.audience).toBe("admin");
    }
  });
});
