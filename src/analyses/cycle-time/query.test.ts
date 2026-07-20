import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makePr } from "../../test-fixtures.js";
import type { NormalizedActor, NormalizedPullRequest } from "../../shared/types.js";
import { buildDwhFromPullRequests } from "../../warehouse/build.js";
import { withDwh } from "../../warehouse/query.js";
import { resolveScope } from "../scope.js";
import { queryCycleFunnel, queryLeadTrend } from "./query.js";

const alice: NormalizedActor = {
  sourceNodeId: "U_alice", type: "User", login: "alice", slug: null, name: "Alice", url: null,
};
const bob: NormalizedActor = {
  sourceNodeId: "U_bob", type: "User", login: "bob", slug: null, name: "Bob", url: null,
};
const bot: NormalizedActor = {
  sourceNodeId: "U_bot", type: "Bot", login: "renovate", slug: null, name: "Renovate", url: null,
};

type PrOpts = {
  num: number;
  firstCommit?: string;
  created: string;
  reviews?: { actor: NormalizedActor; state: "COMMENTED" | "APPROVED"; at: string }[];
  merged?: string | null;
};

function pr(opts: PrOpts): NormalizedPullRequest {
  return makePr({
    repo: { owner: "openai", name: "codex", sourceNodeId: "R_1", visibility: "PRIVATE" },
    sourceNodeId: `PR_${opts.num}`,
    number: opts.num,
    author: "alice",
    authorActor: alice,
    createdAt: opts.created,
    updatedAt: opts.merged ?? opts.created,
    mergedAt: opts.merged ?? null,
    closedAt: opts.merged ?? null,
    commits: opts.firstCommit
      ? [{
          oid: `c_${opts.num}`,
          committedDate: opts.firstCommit,
          authoredDate: opts.firstCommit,
          messageHeadline: "x",
          author: "alice",
          authorActor: alice,
        }]
      : [],
    reviews: (opts.reviews ?? []).map((r) => ({
      author: r.actor.login,
      authorActor: r.actor,
      state: r.state,
      submittedAt: r.at,
    })),
  });
}

async function withFixture<T>(
  prs: NormalizedPullRequest[],
  fn: (runner: Parameters<Parameters<typeof withDwh>[1]>[0]) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "dp-cycle-"));
  const dwhDir = join(root, "dwh");
  try {
    await buildDwhFromPullRequests(prs, { dwhDir, botPatterns: [] });
    return await withDwh(dwhDir, fn);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const scope = { from: new Date("2026-04-19T00:00:00.000Z"), to: new Date("2026-04-27T00:00:00.000Z") };

describe("queryCycleFunnel", () => {
  it("computes p50 hours and n per stage over both non-null boundaries", async () => {
    const prs = [
      pr({
        num: 1,
        firstCommit: "2026-04-20T00:00:00.000Z", // commit
        created: "2026-04-20T02:00:00.000Z", // +2h  → s1 = 2
        reviews: [
          { actor: bob, state: "COMMENTED", at: "2026-04-20T05:00:00.000Z" }, // +3h → s2 = 3
          { actor: bob, state: "APPROVED", at: "2026-04-20T09:00:00.000Z" }, // +4h → s3 = 4
        ],
        merged: "2026-04-20T10:00:00.000Z", // +1h → s4 = 1
      }),
    ];
    const funnel = await withFixture(prs, (r) => queryCycleFunnel(r, resolveScope(scope)));
    expect(funnel.stages.map((s) => [s.key, s.p50Hours, s.n])).toEqual([
      ["commit_to_open", 2, 1],
      ["open_to_review", 3, 1],
      ["review_to_approve", 4, 1],
      ["approve_to_merge", 1, 1],
    ]);
  });

  it("excludes negative stage durations (e.g. first commit after PR open)", async () => {
    const prs = [
      pr({ num: 1, firstCommit: "2026-04-20T00:00:00.000Z", created: "2026-04-20T02:00:00.000Z", merged: "2026-04-20T03:00:00.000Z" }), // s1 = 2
      pr({ num: 2, firstCommit: "2026-04-21T05:00:00.000Z", created: "2026-04-21T02:00:00.000Z", merged: "2026-04-21T06:00:00.000Z" }), // s1 = -3, excluded
    ];
    const funnel = await withFixture(prs, (r) => queryCycleFunnel(r, resolveScope(scope)));
    const s1 = funnel.stages[0]!;
    expect(s1.n).toBe(1);
    expect(s1.p50Hours).toBe(2);
  });

  it("recomputes review timestamps from human reviews only when bots are excluded", async () => {
    const prs = [
      pr({
        num: 1,
        firstCommit: "2026-04-20T00:00:00.000Z",
        created: "2026-04-20T02:00:00.000Z",
        reviews: [
          { actor: bot, state: "COMMENTED", at: "2026-04-20T03:00:00.000Z" }, // bot, 1h after open
          { actor: bob, state: "COMMENTED", at: "2026-04-20T05:00:00.000Z" }, // human, 3h after open
          { actor: bob, state: "APPROVED", at: "2026-04-20T09:00:00.000Z" },
        ],
        merged: "2026-04-20T10:00:00.000Z",
      }),
    ];
    const withBots = await withFixture(prs, (r) => queryCycleFunnel(r, resolveScope({ ...scope, includeBots: true })));
    const noBots = await withFixture(prs, (r) => queryCycleFunnel(r, resolveScope({ ...scope, includeBots: false })));
    // open→review: bot review counts (1h) with bots, human-only (3h) without.
    expect(withBots.stages[1]!.p50Hours).toBe(1);
    expect(noBots.stages[1]!.p50Hours).toBe(3);
  });
});

describe("queryLeadTrend", () => {
  it("buckets the four stage p50s by merged_at grain", async () => {
    const prs = [
      pr({ num: 1, firstCommit: "2026-04-20T00:00:00.000Z", created: "2026-04-20T02:00:00.000Z",
        reviews: [{ actor: bob, state: "APPROVED", at: "2026-04-20T09:00:00.000Z" }],
        merged: "2026-04-20T10:00:00.000Z" }),
    ];
    const trend = await withFixture(prs, (r) => queryLeadTrend(r, resolveScope({ ...scope, grain: "week" })));
    expect(trend.grain).toBe("week");
    expect(trend.buckets).toHaveLength(1);
    expect(trend.buckets[0]!.stages[0]).toEqual({ p50Hours: 2, n: 1 }); // commit→open
    // open→review has no non-approve review, but APPROVED submittedAt is also the
    // first review timestamp, so stage 2 = 7h and stage 3 (review→approve) = 0h.
    expect(trend.buckets[0]!.stages[1]!.p50Hours).toBe(7);
    expect(trend.buckets[0]!.stages[2]!.p50Hours).toBe(0);
  });
});
