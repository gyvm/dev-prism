import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makePr } from "../../test-fixtures.js";
import type { NormalizedActor, NormalizedPullRequest } from "../../shared/types.js";
import { buildDwhFromPullRequests } from "../../warehouse/build.js";
import { withDwh } from "../../warehouse/query.js";
import { resolveScope } from "../scope.js";
import { queryAgingHistogram, queryAgingSummary, queryAgingTable } from "./query.js";

const alice: NormalizedActor = { sourceNodeId: "U_alice", type: "User", login: "alice", slug: null, name: "Alice", url: null };
const bob: NormalizedActor = { sourceNodeId: "U_bob", type: "User", login: "bob", slug: null, name: "Bob", url: null };

const NOW = new Date("2026-04-25T00:00:00.000Z");

function open(num: number, over: Partial<NormalizedPullRequest>): NormalizedPullRequest {
  return makePr({
    repo: { owner: "openai", name: "codex", sourceNodeId: "R_1", visibility: "PRIVATE" },
    sourceNodeId: `PR_${num}`,
    number: num,
    author: "alice",
    authorActor: alice,
    updatedAt: "2026-04-24T00:00:00.000Z",
    mergedAt: null,
    closedAt: null,
    ...over,
  });
}

// PR1 draft, PR2 approved, PR3 changes-requested (unaddressed),
// PR4 awaiting review (requested bob, no review), PR5 changes-requested but a
// newer commit resets it to awaiting review. Ages are chosen to land one PR in
// each histogram band relative to NOW (2026-04-25).
const prs: NormalizedPullRequest[] = [
  open(1, { createdAt: "2026-04-24T12:00:00.000Z", isDraft: true }), // 12h → <1d, draft
  open(2, { createdAt: "2026-04-23T00:00:00.000Z", // 48h → 1-3d, approved
    reviews: [{ author: "bob", authorActor: bob, state: "APPROVED", submittedAt: "2026-04-23T06:00:00.000Z" }] }),
  open(3, { createdAt: "2026-04-21T00:00:00.000Z", // 96h → 3-7d, changes requested
    commits: [{ oid: "c3", committedDate: "2026-04-21T00:00:00.000Z", authoredDate: "2026-04-21T00:00:00.000Z", messageHeadline: "x", author: "alice", authorActor: alice }],
    reviews: [{ author: "bob", authorActor: bob, state: "CHANGES_REQUESTED", submittedAt: "2026-04-22T00:00:00.000Z" }] }),
  open(4, { createdAt: "2026-04-17T00:00:00.000Z", // 192h → 7-14d, awaiting review
    reviewRequests: [{ requestedReviewer: "bob", requestedReviewerActor: bob }] }),
  open(5, { createdAt: "2026-04-05T00:00:00.000Z", // 480h → 14d+, changes requested + newer commit
    reviewRequests: [{ requestedReviewer: "bob", requestedReviewerActor: bob }],
    reviews: [{ author: "bob", authorActor: bob, state: "CHANGES_REQUESTED", submittedAt: "2026-04-06T00:00:00.000Z" }],
    commits: [{ oid: "c5", committedDate: "2026-04-07T00:00:00.000Z", authoredDate: "2026-04-07T00:00:00.000Z", messageHeadline: "x", author: "alice", authorActor: alice }] }),
];

async function withFixture<T>(
  fn: (runner: Parameters<Parameters<typeof withDwh>[1]>[0]) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "dp-aging-"));
  const dwhDir = join(root, "dwh");
  try {
    await buildDwhFromPullRequests(prs, { dwhDir, botPatterns: [] });
    return await withDwh(dwhDir, fn);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("queryAgingTable", () => {
  it("derives status and ball holder per open PR, ordered oldest first", async () => {
    const table = await withFixture((r) => queryAgingTable(r, resolveScope(), NOW));
    const byNum = new Map(table.prs.map((p) => [p.number, p]));

    expect(byNum.get(1)).toMatchObject({ status: "draft", ballHolder: "alice" });
    expect(byNum.get(2)).toMatchObject({ status: "approved", ballHolder: "alice" });
    expect(byNum.get(3)).toMatchObject({ status: "changes_requested", ballHolder: "alice" });
    expect(byNum.get(4)).toMatchObject({ status: "awaiting_review", ballHolder: "bob" });
    // A commit newer than the changes-requested review flips the ball back.
    expect(byNum.get(5)).toMatchObject({ status: "awaiting_review", ballHolder: "bob" });
    // Oldest first (PR5 created 2026-04-05).
    expect(table.prs[0]!.number).toBe(5);
  });
});

describe("queryAgingSummary", () => {
  it("counts open PRs, awaiting-review PRs, and the oldest age in days", async () => {
    const summary = await withFixture((r) => queryAgingSummary(r, resolveScope(), NOW));
    expect(summary.openCount).toBe(5);
    expect(summary.awaitingReviewCount).toBe(2); // PR4 + PR5
    expect(summary.oldestAgeDays).toBeCloseTo(20); // PR5: 480h
  });
});

describe("queryAgingHistogram", () => {
  it("bins open PRs into the fixed age bands", async () => {
    const histogram = await withFixture((r) => queryAgingHistogram(r, resolveScope(), NOW));
    expect(histogram.buckets).toEqual([
      { bucket: "<1d", count: 1 },
      { bucket: "1-3d", count: 1 },
      { bucket: "3-7d", count: 1 },
      { bucket: "7-14d", count: 1 },
      { bucket: "14d+", count: 1 },
    ]);
  });
});
