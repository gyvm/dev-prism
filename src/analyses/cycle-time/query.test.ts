import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makePr } from "../../test-fixtures.js";
import type { NormalizedActor, NormalizedPullRequest } from "../../shared/types.js";
import { buildDwhFromPullRequests } from "../../warehouse/build.js";
import { withDwh } from "../../warehouse/query.js";
import { resolveScope } from "../scope.js";
import { queryCycleFunnel, queryLeadTrend, queryPrStageTimes } from "./query.js";

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

describe("queryPrStageTimes", () => {
  it("returns one row per merged PR with each stage's duration", async () => {
    const prs = [
      pr({
        num: 1,
        firstCommit: "2026-04-20T00:00:00.000Z",
        created: "2026-04-20T02:00:00.000Z", // s1 = 2
        reviews: [
          { actor: bob, state: "COMMENTED", at: "2026-04-20T05:00:00.000Z" }, // s2 = 3
          { actor: bob, state: "APPROVED", at: "2026-04-20T09:00:00.000Z" }, // s3 = 4
        ],
        merged: "2026-04-20T10:00:00.000Z", // s4 = 1
      }),
    ];
    const rows = await withFixture(prs, (r) => queryPrStageTimes(r, resolveScope(scope)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.number).toBe(1);
    expect(rows[0]!.repoKey).toBe("openai/codex");
    expect(rows[0]!.sizeLines).toBe(60); // makePr defaults: 50 additions + 10 deletions
    expect(rows[0]!.stageHours).toEqual([2, 3, 4, 1]);
    expect(rows[0]!.mergedAt).toBe("2026-04-20T10:00:00.000Z");
  });

  it("agrees with the funnel: a stage's single-PR value is that stage's p50", async () => {
    const prs = [
      pr({
        num: 1,
        firstCommit: "2026-04-20T00:00:00.000Z",
        created: "2026-04-20T02:00:00.000Z",
        reviews: [
          { actor: bob, state: "COMMENTED", at: "2026-04-20T05:00:00.000Z" },
          { actor: bob, state: "APPROVED", at: "2026-04-20T09:00:00.000Z" },
        ],
        merged: "2026-04-20T10:00:00.000Z",
      }),
    ];
    const [rows, funnel] = await Promise.all([
      withFixture(prs, (r) => queryPrStageTimes(r, resolveScope(scope))),
      withFixture(prs, (r) => queryCycleFunnel(r, resolveScope(scope))),
    ]);
    expect(rows[0]!.stageHours).toEqual(funnel.stages.map((s) => s.p50Hours));
  });

  it("nulls a negative stage per cell instead of dropping the PR", async () => {
    const prs = [
      pr({
        num: 2,
        firstCommit: "2026-04-21T05:00:00.000Z", // after open → s1 = -3
        created: "2026-04-21T02:00:00.000Z",
        reviews: [{ actor: bob, state: "APPROVED", at: "2026-04-21T04:00:00.000Z" }], // s2 = 2, s3 = 0
        merged: "2026-04-21T06:00:00.000Z", // s4 = 2
      }),
    ];
    const rows = await withFixture(prs, (r) => queryPrStageTimes(r, resolveScope(scope)));
    expect(rows).toHaveLength(1); // the row survives
    expect(rows[0]!.stageHours).toEqual([null, 2, 0, 2]);
  });

  it("leaves an unreached stage null and skips unmerged PRs", async () => {
    const prs = [
      pr({ num: 1, firstCommit: "2026-04-20T00:00:00.000Z", created: "2026-04-20T02:00:00.000Z", merged: "2026-04-20T04:00:00.000Z" }),
      pr({ num: 2, firstCommit: "2026-04-20T00:00:00.000Z", created: "2026-04-20T02:00:00.000Z" }), // open
    ];
    const rows = await withFixture(prs, (r) => queryPrStageTimes(r, resolveScope(scope)));
    expect(rows.map((row) => row.number)).toEqual([1]);
    expect(rows[0]!.stageHours).toEqual([2, null, null, null]); // never reviewed/approved
  });

  it("applies the repo filter and orders by merge time, newest first", async () => {
    const prs = [
      pr({ num: 1, created: "2026-04-20T00:00:00.000Z", merged: "2026-04-20T04:00:00.000Z" }),
      pr({ num: 2, created: "2026-04-21T00:00:00.000Z", merged: "2026-04-22T04:00:00.000Z" }),
    ];
    const rows = await withFixture(prs, (r) => queryPrStageTimes(r, resolveScope(scope)));
    expect(rows.map((row) => row.number)).toEqual([2, 1]);

    const filtered = await withFixture(prs, (r) =>
      queryPrStageTimes(r, resolveScope({ ...scope, repos: ["other/repo"] })),
    );
    expect(filtered).toEqual([]);
  });

  it("recomputes review timestamps from human reviews only when bots are excluded", async () => {
    const prs = [
      pr({
        num: 1,
        firstCommit: "2026-04-20T00:00:00.000Z",
        created: "2026-04-20T02:00:00.000Z",
        reviews: [
          { actor: bot, state: "COMMENTED", at: "2026-04-20T03:00:00.000Z" }, // bot, 1h
          { actor: bob, state: "COMMENTED", at: "2026-04-20T05:00:00.000Z" }, // human, 3h
          { actor: bob, state: "APPROVED", at: "2026-04-20T09:00:00.000Z" },
        ],
        merged: "2026-04-20T10:00:00.000Z",
      }),
    ];
    const withBots = await withFixture(prs, (r) =>
      queryPrStageTimes(r, resolveScope({ ...scope, includeBots: true })),
    );
    const noBots = await withFixture(prs, (r) =>
      queryPrStageTimes(r, resolveScope({ ...scope, includeBots: false })),
    );
    expect(withBots[0]!.stageHours[1]).toBe(1);
    expect(noBots[0]!.stageHours[1]).toBe(3);
  });
});
