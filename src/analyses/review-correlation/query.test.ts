import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makePr } from "../../test-fixtures.js";
import type { NormalizedActor, NormalizedPullRequest, ReviewCorrelation } from "../../shared/types.js";
import { createBotLoginMatcher } from "../../shared/bot.js";
import { buildDwhFromPullRequests } from "../../warehouse/build.js";
import { withDwh } from "../../warehouse/query.js";
import { resolveScope } from "../scope.js";
import { computeReviewCorrelation } from "./internal/reviewCorrelation.js";
import { queryReviewCorrelation } from "./query.js";

function actor(id: string, login: string, type = "User"): NormalizedActor {
  return { sourceNodeId: id, type, login, slug: null, name: login, url: null };
}

const alice = actor("U_alice", "alice");
const bob = actor("U_bob", "bob");
const carol = actor("U_carol", "carol");
const bot = actor("U_bot", "renovate[bot]", "Bot");

type Review = NormalizedPullRequest["reviews"][number];

function review(a: NormalizedActor, state: Review["state"], at: string): Review {
  return { sourceNodeId: `REV_${a.login}_${at}`, author: a.login, authorActor: a, state, submittedAt: at };
}

function pr(
  num: number,
  author: NormalizedActor,
  reviews: Review[],
): NormalizedPullRequest {
  return makePr({
    repo: { owner: "openai", name: "codex", sourceNodeId: "R_1", visibility: "PRIVATE" },
    sourceNodeId: `PR_${num}`,
    number: num,
    title: `PR ${num}`,
    author: author.login,
    authorActor: author,
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-21T00:00:00.000Z",
    additions: 1,
    deletions: 0,
    reviews,
  });
}

// Sort everything by a stable key so the comparison is independent of the
// (different but valid) tiebreak orderings of the TS and SQL implementations.
function normalize(correlation: ReviewCorrelation): ReviewCorrelation {
  return {
    authors: [...correlation.authors].sort((a, b) => a.login.localeCompare(b.login)),
    reviewers: [...correlation.reviewers].sort((a, b) => a.login.localeCompare(b.login)),
    pairs: [...correlation.pairs].sort(
      (a, b) => a.author.localeCompare(b.author) || a.reviewer.localeCompare(b.reviewer),
    ),
  };
}

describe("queryReviewCorrelation parity with computeReviewCorrelation", () => {
  it("produces the same view-model from the DWH as the in-memory compute", async () => {
    const prs = [
      pr(1, alice, [
        review(bob, "APPROVED", "2026-04-20T04:00:00.000Z"),
        review(carol, "COMMENTED", "2026-04-20T05:00:00.000Z"),
        review(bot, "COMMENTED", "2026-04-20T03:00:00.000Z"),
      ]),
      pr(2, bob, [
        review(alice, "CHANGES_REQUESTED", "2026-04-20T06:00:00.000Z"),
        review(carol, "APPROVED", "2026-04-20T07:00:00.000Z"),
      ]),
      pr(3, alice, [
        review(alice, "COMMENTED", "2026-04-20T08:00:00.000Z"), // self-review, excluded
        review(bob, "APPROVED", "2026-04-20T09:00:00.000Z"),
      ]),
    ];

    const botPatterns = ["\\[bot\\]$"];
    const expected = normalize(computeReviewCorrelation(prs, createBotLoginMatcher(botPatterns)));

    const root = await mkdtemp(join(tmpdir(), "gh-insights-rc-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildDwhFromPullRequests(prs, { dwhDir, botPatterns });
      const actual = await withDwh(dwhDir, (runner) =>
        queryReviewCorrelation(runner, resolveScope()),
      );
      expect(normalize(actual)).toEqual(expected);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("applies scope.users across both author and reviewer axes", async () => {
    const prs = [
      pr(1, alice, [review(bob, "APPROVED", "2026-04-20T04:00:00.000Z")]), // alice as author
      pr(2, bob, [review(carol, "APPROVED", "2026-04-20T05:00:00.000Z")]), // neither axis is alice
      pr(3, carol, [review(alice, "COMMENTED", "2026-04-20T06:00:00.000Z")]), // alice as reviewer
    ];

    const root = await mkdtemp(join(tmpdir(), "gh-insights-rc-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildDwhFromPullRequests(prs, { dwhDir, botPatterns: [] });
      const result = await withDwh(dwhDir, (runner) =>
        queryReviewCorrelation(runner, resolveScope({ users: ["alice"] })),
      );

      expect(result.authors.map((a) => a.login)).toEqual(["alice"]);
      const pairKeys = result.pairs.map((p) => `${p.author}->${p.reviewer}`).sort();
      expect(pairKeys).toEqual(["alice->bob", "carol->alice"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
