import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makePr } from "../../test-fixtures.js";
import type { NormalizedActor, NormalizedPullRequest } from "../../shared/types.js";
import { buildDwhFromPullRequests } from "../../warehouse/build.js";
import { withDwh } from "../../warehouse/query.js";
import { resolveScope } from "../scope.js";
import { queryReviewerLead, queryReviewlessMerges, querySizePickupScatter } from "./query.js";

const alice: NormalizedActor = { sourceNodeId: "U_alice", type: "User", login: "alice", slug: null, name: "Alice", url: null };
const bob: NormalizedActor = { sourceNodeId: "U_bob", type: "User", login: "bob", slug: null, name: "Bob", url: null };
const carol: NormalizedActor = { sourceNodeId: "U_carol", type: "User", login: "carol", slug: null, name: "Carol", url: null };
const bot: NormalizedActor = { sourceNodeId: "U_bot", type: "Bot", login: "renovate", slug: null, name: "Renovate", url: null };

function basePr(num: number, over: Partial<NormalizedPullRequest>): NormalizedPullRequest {
  return makePr({
    repo: { owner: "openai", name: "codex", sourceNodeId: "R_1", visibility: "PRIVATE" },
    sourceNodeId: `PR_${num}`,
    number: num,
    author: "alice",
    authorActor: alice,
    createdAt: "2026-04-20T02:00:00.000Z",
    updatedAt: "2026-04-20T12:00:00.000Z",
    ...over,
  });
}

async function withFixture<T>(
  prs: NormalizedPullRequest[],
  fn: (runner: Parameters<Parameters<typeof withDwh>[1]>[0]) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "dp-review-"));
  const dwhDir = join(root, "dwh");
  try {
    await buildDwhFromPullRequests(prs, { dwhDir, botPatterns: [] });
    return await withDwh(dwhDir, fn);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const scope = { from: new Date("2026-04-19T00:00:00.000Z"), to: new Date("2026-04-27T00:00:00.000Z") };

describe("queryReviewlessMerges", () => {
  const prs = [
    basePr(1, { mergedAt: "2026-04-20T10:00:00.000Z", closedAt: "2026-04-20T10:00:00.000Z",
      reviews: [{ author: "bob", authorActor: bob, state: "COMMENTED", submittedAt: "2026-04-20T05:00:00.000Z" }] }),
    basePr(2, { mergedAt: "2026-04-20T10:00:00.000Z", closedAt: "2026-04-20T10:00:00.000Z", reviews: [] }),
    basePr(3, { mergedAt: "2026-04-20T10:00:00.000Z", closedAt: "2026-04-20T10:00:00.000Z",
      reviews: [{ author: "renovate", authorActor: bot, state: "COMMENTED", submittedAt: "2026-04-20T04:00:00.000Z" }] }),
  ];

  it("counts merged PRs with no review at all (bots included)", async () => {
    const result = await withFixture(prs, (r) => queryReviewlessMerges(r, resolveScope({ ...scope, includeBots: true })));
    expect(result.mergedCount).toBe(3);
    expect(result.reviewlessCount).toBe(1); // only PR2
    expect(result.rate).toBeCloseTo(1 / 3);
  });

  it("treats bot-only reviews as review-less when bots are excluded", async () => {
    const result = await withFixture(prs, (r) => queryReviewlessMerges(r, resolveScope({ ...scope, includeBots: false })));
    expect(result.mergedCount).toBe(3);
    expect(result.reviewlessCount).toBe(2); // PR2 and PR3 (bot-only)
  });

  it("returns null rate when nothing merged", async () => {
    const result = await withFixture([basePr(9, { mergedAt: null, closedAt: null })], (r) =>
      queryReviewlessMerges(r, resolveScope(scope)),
    );
    expect(result.mergedCount).toBe(0);
    expect(result.rate).toBeNull();
  });
});

describe("querySizePickupScatter", () => {
  it("returns one point per reviewed merged PR and excludes never-reviewed PRs", async () => {
    const prs = [
      basePr(1, { additions: 40, deletions: 20, mergedAt: "2026-04-20T10:00:00.000Z", closedAt: "2026-04-20T10:00:00.000Z",
        reviews: [{ author: "bob", authorActor: bob, state: "COMMENTED", submittedAt: "2026-04-20T05:00:00.000Z" }] }),
      basePr(2, { mergedAt: "2026-04-20T11:00:00.000Z", closedAt: "2026-04-20T11:00:00.000Z", reviews: [] }),
    ];
    const scatter = await withFixture(prs, (r) => querySizePickupScatter(r, resolveScope(scope)));
    expect(scatter.points).toHaveLength(1);
    expect(scatter.points[0]).toMatchObject({ number: 1, pickupHours: 3, sizeLines: 60, repoKey: "openai/codex" });
    expect(scatter.totalMatched).toBe(1);
    expect(scatter.truncated).toBe(false);
  });

  it("caps points and flags truncation via the scatterMaxPoints threshold", async () => {
    const prs = [1, 2, 3].map((n) =>
      basePr(n, {
        mergedAt: `2026-04-2${n}T10:00:00.000Z`,
        closedAt: `2026-04-2${n}T10:00:00.000Z`,
        reviews: [{ author: "bob", authorActor: bob, state: "COMMENTED", submittedAt: `2026-04-2${n}T05:00:00.000Z` }],
        createdAt: `2026-04-2${n}T02:00:00.000Z`,
      }),
    );
    const scatter = await withFixture(prs, (r) =>
      querySizePickupScatter(r, resolveScope({ ...scope, thresholds: { scatterMaxPoints: 2 } })),
    );
    expect(scatter.points).toHaveLength(2);
    expect(scatter.totalMatched).toBe(3);
    expect(scatter.truncated).toBe(true);
  });
});

describe("queryReviewerLead", () => {
  it("pairs first request with the reviewer's first later review; keeps unanswered as pending", async () => {
    const prs = [
      basePr(1, {
        mergedAt: "2026-04-20T12:00:00.000Z",
        closedAt: "2026-04-20T12:00:00.000Z",
        timelineEvents: [
          { sourceNodeId: "RR_bob", type: "review_requested", createdAt: "2026-04-20T00:00:00.000Z", actor: alice, requestedReviewerActor: bob },
          { sourceNodeId: "RR_carol", type: "review_requested", createdAt: "2026-04-20T00:00:00.000Z", actor: alice, requestedReviewerActor: carol },
        ],
        reviews: [{ author: "bob", authorActor: bob, state: "APPROVED", submittedAt: "2026-04-20T03:00:00.000Z" }],
      }),
    ];
    const result = await withFixture(prs, (r) => queryReviewerLead(r, resolveScope(scope)));
    const byName = new Map(result.reviewers.map((rv) => [rv.reviewer, rv]));
    expect(byName.get("bob")).toEqual({ reviewer: "bob", p50Hours: 3, respondedCount: 1, pendingCount: 0 });
    expect(byName.get("carol")).toEqual({ reviewer: "carol", p50Hours: null, respondedCount: 0, pendingCount: 1 });
  });
});
