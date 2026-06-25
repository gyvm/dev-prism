import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DuckDBConnection } from "@duckdb/node-api";
import { describe, expect, it } from "vitest";

import { makePr } from "../test-fixtures.js";
import type { NormalizedActor, NormalizedPullRequest } from "../shared/types.js";
import { buildDwhFromPullRequests } from "./build.js";

const alice: NormalizedActor = {
  sourceNodeId: "U_1",
  type: "User",
  login: "alice",
  slug: null,
  name: "Alice",
  url: null,
};

const bob: NormalizedActor = {
  sourceNodeId: "U_2",
  type: "User",
  login: "bob",
  slug: null,
  name: "Bob",
  url: null,
};

function warehousePr(overrides: Partial<NormalizedPullRequest> = {}): NormalizedPullRequest {
  return makePr({
    repo: { owner: "openai", name: "codex", sourceNodeId: "R_1", visibility: "PRIVATE" },
    sourceNodeId: "PR_1",
    number: 1,
    title: "Initial PR",
    bodyText: "Initial body",
    author: "alice",
    authorActor: alice,
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-21T00:00:00.000Z",
    additions: 10,
    deletions: 2,
    changedFiles: 1,
    reviews: [
      {
        sourceNodeId: "REV_1",
        author: "bob",
        authorActor: bob,
        state: "APPROVED",
        submittedAt: "2026-04-20T04:00:00.000Z",
        updatedAt: "2026-04-20T04:01:00.000Z",
        bodyText: "Approved",
      },
    ],
    comments: [
      {
        sourceNodeId: "IC_1",
        author: "bob",
        authorActor: bob,
        bodyText: "Issue comment",
        createdAt: "2026-04-20T03:00:00.000Z",
        updatedAt: null,
        url: "https://example.com/comment",
      },
    ],
    ...overrides,
  });
}

async function queryRows<T extends Record<string, unknown>>(dwhDir: string, sql: string): Promise<T[]> {
  const connection = await DuckDBConnection.create();
  try {
    const reader = await connection.runAndReadAll(sql.replaceAll("$DWH", dwhDir));
    return reader.getRowObjects() as T[];
  } finally {
    connection.closeSync();
  }
}

describe("buildDwhFromPullRequests", () => {
  it("creates parquet files and upserts changed PR rows", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-dwh-"));
    const dwhDir = join(root, "dwh");

    try {
      const first = await buildDwhFromPullRequests([
        warehousePr(),
        warehousePr({
          repo: { owner: "openai", name: "evals", sourceNodeId: "R_2", visibility: "PUBLIC" },
          sourceNodeId: "PR_2",
          number: 2,
          title: "Other PR",
          reviews: [],
          comments: [],
        }),
      ], { dwhDir, botPatterns: [] });

      expect(first.changedPrCount).toBe(2);
      expect(first.rowsByTable.pull_requests).toBe(2);

      let counts = await queryRows<{ count: bigint }>(
        dwhDir,
        "SELECT count(*) AS count FROM read_parquet('$DWH/pull_requests.parquet')",
      );
      expect(counts[0]?.count).toBe(2n);

      await buildDwhFromPullRequests([
        warehousePr({
          title: "Updated PR",
          updatedAt: "2026-04-22T00:00:00.000Z",
          reviews: [],
          comments: [],
          bodyText: "Updated body",
        }),
      ], { dwhDir, botPatterns: [] });

      const pullRequests = await queryRows<{ pr_id: string; title: string }>(
        dwhDir,
        "SELECT pr_id, title FROM read_parquet('$DWH/pull_requests.parquet') ORDER BY pr_id",
      );
      expect(pullRequests).toEqual([
        { pr_id: "PR_1", title: "Updated PR" },
        { pr_id: "PR_2", title: "Other PR" },
      ]);

      counts = await queryRows<{ count: bigint }>(
        dwhDir,
        "SELECT count(*) AS count FROM read_parquet('$DWH/pr_reviews.parquet') WHERE pr_id = 'PR_1'",
      );
      expect(counts[0]?.count).toBe(0n);

      counts = await queryRows<{ count: bigint }>(
        dwhDir,
        "SELECT count(*) AS count FROM read_parquet('$DWH/bodies.parquet') WHERE subject_id IN ('REV_1', 'IC_1')",
      );
      expect(counts[0]?.count).toBe(0n);

      const bodies = await queryRows<{ subject_id: string; text: string }>(
        dwhDir,
        "SELECT subject_id, text FROM read_parquet('$DWH/bodies.parquet') WHERE subject_id = 'PR_1'",
      );
      expect(bodies).toEqual([{ subject_id: "PR_1", text: "Updated body" }]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("purges stale path-keyed child rows when a PR shrinks across rebuilds", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-dwh-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildDwhFromPullRequests(
        [warehousePr({
          reviews: [], comments: [],
          files: [
            { path: "a.ts", additions: 1, deletions: 0, changeType: "MODIFIED" },
            { path: "b.ts", additions: 2, deletions: 0, changeType: "ADDED" },
            { path: "c.ts", additions: 3, deletions: 1, changeType: "MODIFIED" },
          ],
        })],
        { dwhDir, botPatterns: [] },
      );
      // Same PR re-fetched with only one file remaining.
      await buildDwhFromPullRequests(
        [warehousePr({
          reviews: [], comments: [], updatedAt: "2026-04-23T00:00:00.000Z",
          files: [{ path: "a.ts", additions: 5, deletions: 0, changeType: "MODIFIED" }],
        })],
        { dwhDir, botPatterns: [] },
      );

      const files = await queryRows<{ path: string }>(
        dwhDir,
        "SELECT path FROM read_parquet('$DWH/pr_files.parquet') WHERE pr_id = 'PR_1' ORDER BY path",
      );
      expect(files.map((f) => f.path)).toEqual(["a.ts"]); // b.ts / c.ts purged, no stale rows
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("de-dupes intra-batch rows that share a logical primary key", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-dwh-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildDwhFromPullRequests(
        [
          warehousePr({
            reviews: [],
            comments: [],
            labels: [{ name: "bug" }, { name: "bug" }], // duplicate label
            files: [
              { path: "src/a.ts", additions: 1, deletions: 0, changeType: "MODIFIED" },
              { path: "src/a.ts", additions: 2, deletions: 1, changeType: "MODIFIED" }, // duplicate (pr_id, path)
            ],
          }),
        ],
        { dwhDir, botPatterns: [] },
      );

      const labels = await queryRows<{ count: bigint }>(
        dwhDir,
        "SELECT count(*) AS count FROM read_parquet('$DWH/pr_labels.parquet')",
      );
      expect(labels[0]?.count).toBe(1n);

      const files = await queryRows<{ count: bigint }>(
        dwhDir,
        "SELECT count(*) AS count FROM read_parquet('$DWH/pr_files.parquet')",
      );
      expect(files[0]?.count).toBe(1n);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps issue-comment bodies idempotent across rebuilds when the comment has no node id", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-dwh-"));
    const dwhDir = join(root, "dwh");
    const withAnonComment = () =>
      warehousePr({
        reviews: [],
        comments: [
          {
            // no sourceNodeId → both activities.event_id and bodies.subject_id
            // fall back to the shared deterministic id
            author: "bob",
            authorActor: bob,
            bodyText: "anon comment",
            createdAt: "2026-04-20T03:00:00.000Z",
            updatedAt: null,
            url: null,
          },
        ],
      });
    try {
      await buildDwhFromPullRequests([withAnonComment()], { dwhDir, botPatterns: [] });
      await buildDwhFromPullRequests([withAnonComment()], { dwhDir, botPatterns: [] });

      const bodies = await queryRows<{ count: bigint }>(
        dwhDir,
        "SELECT count(*) AS count FROM read_parquet('$DWH/bodies.parquet') WHERE subject_kind = 'issue_comment'",
      );
      expect(bodies[0]?.count).toBe(1n);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
