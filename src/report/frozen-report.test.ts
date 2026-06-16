import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makePr } from "../test-fixtures.js";
import type { NormalizedActor, NormalizedPullRequest } from "../shared/types.js";
import { resolveScope } from "../analyses/scope.js";
import { buildDwhFromPullRequests } from "../warehouse/build.js";
import { withDwh } from "../warehouse/query.js";
import {
  REPORT_INDEX_SCHEMA,
  buildFrozenReport,
  deriveReportId,
  upsertIndexEntry,
  writeFrozenReport,
} from "./frozen-report.js";

const alice: NormalizedActor = { sourceNodeId: "U_alice", type: "User", login: "alice", slug: null, name: "Alice", url: null };
const bob: NormalizedActor = { sourceNodeId: "U_bob", type: "User", login: "bob", slug: null, name: "Bob", url: null };

function fixture(): NormalizedPullRequest {
  return makePr({
    repo: { owner: "openai", name: "codex", sourceNodeId: "R_1", visibility: "PRIVATE" },
    sourceNodeId: "PR_1",
    number: 1,
    title: "Feature",
    author: "alice",
    authorActor: alice,
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-22T00:00:00.000Z",
    mergedAt: "2026-04-22T00:00:00.000Z",
    additions: 10,
    deletions: 1,
    reviews: [{ author: "bob", authorActor: bob, state: "APPROVED", submittedAt: "2026-04-21T00:00:00.000Z" }],
  });
}

const scope = resolveScope({ from: new Date("2026-04-20T00:00:00.000Z"), to: new Date("2026-04-27T00:00:00.000Z") });
const generatedAt = new Date("2026-04-27T09:00:00.000Z");

describe("buildFrozenReport", () => {
  it("renders a self-contained HTML report and a valid index entry from the DWH", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-frozen-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildDwhFromPullRequests([fixture()], { dwhDir, botPatterns: [] });
      const report = await withDwh(dwhDir, (runner) =>
        buildFrozenReport(runner, { scope, generatedAt, title: "Weekly" }),
      );

      expect(report.id).toBe(deriveReportId("Weekly", scope, "UTC"));
      expect(report.html).toContain("<!doctype html>");
      // No external references — single-file shareable.
      expect(report.html).not.toMatch(/<(link|script)[^>]+(href|src)=/i);
      expect(report.indexEntry.kpi.deploymentFrequency).toBe(1);
      expect(report.indexEntry.kpi.prMerged).toBe(1);
      // The index entry must satisfy the published schema.
      expect(() => REPORT_INDEX_SCHEMA.parse([report.indexEntry])).not.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("writeFrozenReport + index.json", () => {
  it("writes the html and upserts the index entry idempotently", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-frozen-"));
    const dwhDir = join(root, "dwh");
    const reportsDir = join(root, "reports");
    const indexPath = join(reportsDir, "index.json");
    try {
      await buildDwhFromPullRequests([fixture()], { dwhDir, botPatterns: [] });

      const opts = { scope, generatedAt, title: "Weekly" };
      await withDwh(dwhDir, (runner) => writeFrozenReport(runner, opts, { reportsDir }));
      // Re-run the same report: should replace, not duplicate, the index entry.
      const second = await withDwh(dwhDir, (runner) => writeFrozenReport(runner, opts, { reportsDir }));

      const html = await readFile(second.htmlPath, "utf8");
      expect(html).toContain("<!doctype html>");

      const index = REPORT_INDEX_SCHEMA.parse(JSON.parse(await readFile(indexPath, "utf8")));
      expect(index).toHaveLength(1);
      expect(index[0]!.id).toBe(second.id);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps index entries sorted newest-first across reports", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-frozen-"));
    const indexPath = join(root, "index.json");
    try {
      const base = {
        title: "t",
        scope: { from: null, to: null, repos: [], users: [], includeBots: true, grain: "week" as const },
        kpi: { deploymentFrequency: 0, leadTimeForChangesHours: null, prOpened: 0, prMerged: 0 },
        highlights: [],
        aiCount: 0,
      };
      await upsertIndexEntry(indexPath, { ...base, id: "a", generatedAt: "2026-04-20T00:00:00.000Z" });
      await upsertIndexEntry(indexPath, { ...base, id: "b", generatedAt: "2026-04-27T00:00:00.000Z" });

      const index = REPORT_INDEX_SCHEMA.parse(JSON.parse(await readFile(indexPath, "utf8")));
      expect(index.map((e) => e.id)).toEqual(["b", "a"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
