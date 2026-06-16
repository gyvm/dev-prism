import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makePr } from "../../test-fixtures.js";
import type { NormalizedActor, NormalizedPullRequest } from "../../shared/types.js";
import { neverBotLogin } from "../../shared/bot.js";
import { buildDwhFromPullRequests } from "../../warehouse/build.js";
import { withDwh } from "../../warehouse/query.js";
import { resolveScope } from "../scope.js";
import { selectTimelinePrs } from "./internal/timeline.js";
import { queryPrTimeline } from "./query.js";

function actor(id: string, login: string): NormalizedActor {
  return { sourceNodeId: id, type: "User", login, slug: null, name: login, url: null };
}
const alice = actor("U_alice", "alice");
const bob = actor("U_bob", "bob");
const carol = actor("U_carol", "carol");

const from = new Date("2026-04-20T00:00:00.000Z");
const to = new Date("2026-04-27T00:00:00.000Z");

function prs(): NormalizedPullRequest[] {
  return [
    makePr({
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
      commits: [
        {
          oid: "c1",
          committedDate: "2026-04-19T20:00:00.000Z",
          authoredDate: "2026-04-19T20:00:00.000Z",
          messageHeadline: "wip",
          author: "alice",
          authorActor: alice,
        },
      ],
      timelineEvents: [
        { type: "ready_for_review", createdAt: "2026-04-20T01:00:00.000Z", actor: alice },
      ],
      reviews: [
        { author: "bob", authorActor: bob, state: "APPROVED", submittedAt: "2026-04-21T00:00:00.000Z" },
      ],
      comments: [
        { author: "carol", authorActor: carol, bodyText: "thoughts", createdAt: "2026-04-20T12:00:00.000Z", updatedAt: null, url: null },
      ],
      reviewThreads: [
        {
          isResolved: false,
          isOutdated: false,
          path: "src/a.ts",
          line: 3,
          startLine: null,
          comments: [
            { author: "bob", authorActor: bob, bodyText: "nit", createdAt: "2026-04-20T15:00:00.000Z", updatedAt: null, url: null, path: "src/a.ts", line: 3 },
          ],
        },
      ],
    }),
    makePr({
      repo: { owner: "openai", name: "codex", sourceNodeId: "R_1", visibility: "PRIVATE" },
      sourceNodeId: "PR_2",
      number: 2,
      title: "Abandoned",
      author: "bob",
      authorActor: bob,
      createdAt: "2026-04-21T00:00:00.000Z",
      updatedAt: "2026-04-23T00:00:00.000Z",
      closedAt: "2026-04-23T00:00:00.000Z",
      additions: 5,
      deletions: 0,
    }),
  ];
}

describe("queryPrTimeline parity with selectTimelinePrs", () => {
  it("reconstructs the same timelines from the DWH as the in-memory compute", async () => {
    const fixtures = prs();
    const expected = selectTimelinePrs(fixtures, from, to, undefined, neverBotLogin);

    const root = await mkdtemp(join(tmpdir(), "gh-insights-tl-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildDwhFromPullRequests(fixtures, { dwhDir, botPatterns: [] });
      const output = await withDwh(dwhDir, (runner) =>
        queryPrTimeline(runner, resolveScope({ from, to })),
      );
      expect(output.timelines).toEqual(expected);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
