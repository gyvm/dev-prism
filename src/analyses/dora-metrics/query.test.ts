import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makePr } from "../../test-fixtures.js";
import type { NormalizedActor, NormalizedPullRequest } from "../../shared/types.js";
import { isMergedInWeek } from "../../shared/week.js";
import { buildDwhFromPullRequests } from "../../warehouse/build.js";
import { withDwh } from "../../warehouse/query.js";
import { resolveScope } from "../scope.js";
import { calculatePrMetrics } from "./internal/calculate.js";
import { computeAggregateMetrics } from "./internal/aggregate.js";
import { computeDora } from "./internal/dora.js";
import { queryDora } from "./query.js";

const alice: NormalizedActor = {
  sourceNodeId: "U_alice",
  type: "User",
  login: "alice",
  slug: null,
  name: "Alice",
  url: null,
};

function pr(
  num: number,
  opts: { created: string; merged: string | null; labels?: string[] },
): NormalizedPullRequest {
  return makePr({
    repo: { owner: "openai", name: "codex", sourceNodeId: "R_1", visibility: "PRIVATE" },
    sourceNodeId: `PR_${num}`,
    number: num,
    title: `PR ${num}`,
    author: "alice",
    authorActor: alice,
    createdAt: opts.created,
    updatedAt: opts.merged ?? opts.created,
    mergedAt: opts.merged,
    closedAt: opts.merged,
    additions: 10,
    deletions: 2,
    labels: (opts.labels ?? []).map((name) => ({ name })),
  });
}

const from = new Date("2026-04-20T00:00:00.000Z");
const to = new Date("2026-04-27T00:00:00.000Z");

function expectedDora(prs: NormalizedPullRequest[]) {
  const weekPrs = prs.filter((p) => isMergedInWeek(p, from, to));
  const aggregate = computeAggregateMetrics(weekPrs.map(calculatePrMetrics), 48);
  return computeDora(weekPrs, aggregate);
}

describe("queryDora parity with computeDora", () => {
  it("matches the in-memory DORA view-model over the same merged window", async () => {
    const prs = [
      pr(1, { created: "2026-04-20T00:00:00.000Z", merged: "2026-04-20T12:00:00.000Z" }),
      pr(2, { created: "2026-04-21T00:00:00.000Z", merged: "2026-04-22T06:00:00.000Z", labels: ["hotfix"] }),
      pr(3, { created: "2026-04-22T00:00:00.000Z", merged: "2026-04-25T00:00:00.000Z", labels: ["Revert"] }),
      pr(4, { created: "2026-04-23T00:00:00.000Z", merged: null }), // open, excluded
      pr(5, { created: "2026-04-01T00:00:00.000Z", merged: "2026-04-05T00:00:00.000Z" }), // merged before window
    ];

    const expected = expectedDora(prs);

    const root = await mkdtemp(join(tmpdir(), "gh-insights-dora-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildDwhFromPullRequests(prs, { dwhDir, botPatterns: [] });
      const actual = await withDwh(dwhDir, (runner) =>
        queryDora(runner, resolveScope({ from, to })),
      );
      expect(actual).toEqual(expected);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("filters merged PRs by scope.users (author axis)", async () => {
    const bob: NormalizedActor = { sourceNodeId: "U_bob", type: "User", login: "bob", slug: null, name: "Bob", url: null };
    const prs = [
      // alice: two merged in-window
      { ...pr(1, { created: "2026-04-20T00:00:00.000Z", merged: "2026-04-20T02:00:00.000Z" }) },
      { ...pr(2, { created: "2026-04-21T00:00:00.000Z", merged: "2026-04-21T04:00:00.000Z" }) },
      // bob: one merged in-window
      { ...pr(3, { created: "2026-04-22T00:00:00.000Z", merged: "2026-04-22T06:00:00.000Z" }), author: "bob", authorActor: bob },
    ];

    const root = await mkdtemp(join(tmpdir(), "gh-insights-dora-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildDwhFromPullRequests(prs, { dwhDir, botPatterns: [] });
      const all = await withDwh(dwhDir, (runner) => queryDora(runner, resolveScope({ from, to })));
      const onlyAlice = await withDwh(dwhDir, (runner) => queryDora(runner, resolveScope({ from, to, users: ["alice"] })));
      expect(all.deploymentFrequency).toBe(3);
      expect(onlyAlice.deploymentFrequency).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns null metrics when nothing merged in the window", async () => {
    const prs = [pr(1, { created: "2026-04-01T00:00:00.000Z", merged: "2026-04-05T00:00:00.000Z" })];
    const root = await mkdtemp(join(tmpdir(), "gh-insights-dora-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildDwhFromPullRequests(prs, { dwhDir, botPatterns: [] });
      const actual = await withDwh(dwhDir, (runner) =>
        queryDora(runner, resolveScope({ from, to })),
      );
      expect(actual).toEqual({
        deploymentFrequency: 0,
        leadTimeForChangesHours: null,
        changeFailureRatePercent: null,
        mttrHours: null,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
