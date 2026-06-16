import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makePr } from "../test-fixtures.js";
import type { NormalizedActor, NormalizedPullRequest } from "../shared/types.js";
import { buildDwhFromPullRequests } from "../warehouse/build.js";
import { withDwh } from "../warehouse/query.js";
import { renderDwhAnalysis, type DwhAnalysisId } from "./dwh-report.js";
import { resolveScope } from "./scope.js";

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

describe("renderDwhAnalysis", () => {
  it("renders each analysis to HTML from the DWH through the existing renderers", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-dwhreport-"));
    const dwhDir = join(root, "dwh");
    const scope = resolveScope({ from: new Date("2026-04-20T00:00:00.000Z"), to: new Date("2026-04-27T00:00:00.000Z") });
    const ids: DwhAnalysisId[] = ["dora-metrics", "review-correlation", "pr-timeline"];
    try {
      await buildDwhFromPullRequests([fixture()], { dwhDir, botPatterns: [] });
      await withDwh(dwhDir, async (runner) => {
        for (const id of ids) {
          const html = await renderDwhAnalysis(runner, id, scope);
          expect(typeof html).toBe("string");
          expect(html).toContain("<");
        }
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
