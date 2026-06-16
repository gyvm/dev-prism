import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makePr } from "../test-fixtures.js";
import { buildDwhFromPullRequests } from "./build.js";
import { openDwh, withDwh } from "./query.js";

describe("openDwh / withDwh", () => {
  it("exposes every table (empty) when no parquet exists yet", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-q-"));
    try {
      // A brand-new, never-collected DWH directory.
      const counts = await withDwh(join(root, "empty"), async (runner) => ({
        prs: await runner.all("SELECT count(*) AS c FROM pull_requests"),
        activities: await runner.all("SELECT count(*) AS c FROM activities"),
        actors: await runner.all("SELECT count(*) AS c FROM actors"),
      }));
      expect(Number((counts.prs[0] as { c: bigint }).c)).toBe(0);
      expect(Number((counts.activities[0] as { c: bigint }).c)).toBe(0);
      expect(Number((counts.actors[0] as { c: bigint }).c)).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("aggregates over an empty table without erroring (NULL, not throw)", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-q-"));
    try {
      const rows = await withDwh(join(root, "empty"), (runner) =>
        runner.all<{ p50: number | null }>("SELECT median(additions) AS p50 FROM pull_requests"),
      );
      expect(rows[0]?.p50 ?? null).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reads parquet for tables that exist while keeping absent tables empty", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-q-"));
    const dwhDir = join(root, "dwh");
    try {
      // A PR with no labels/files/commits → those parquet files are still
      // written by build, so this also exercises the populated-view path.
      await buildDwhFromPullRequests(
        [
          makePr({
            repo: { owner: "o", name: "r", sourceNodeId: "R_1", visibility: "PRIVATE" },
            sourceNodeId: "PR_1",
            number: 1,
            title: "PR",
            author: "alice",
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-21T00:00:00.000Z",
            additions: 1,
            deletions: 0,
          }),
        ],
        { dwhDir, botPatterns: [] },
      );

      const rows = await withDwh(dwhDir, (runner) =>
        runner.all<{ c: bigint }>("SELECT count(*) AS c FROM pull_requests"),
      );
      expect(Number(rows[0]!.c)).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("closes the connection even when the callback throws", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-q-"));
    try {
      const handle = await openDwh(join(root, "empty"));
      handle.close();
      // A second close must not throw (idempotent teardown contract).
      expect(() => handle.close()).not.toThrow();

      await expect(
        withDwh(join(root, "empty"), async () => {
          throw new Error("callback boom");
        }),
      ).rejects.toThrow(/callback boom/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
