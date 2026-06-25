import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makePr } from "../test-fixtures.js";
import { buildDwhFromPullRequests } from "./build.js";
import { type Migration, migrateDwh, readSchemaVersion } from "./migrate.js";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function buildBaselineDwh(dwhDir: string): Promise<void> {
  await buildDwhFromPullRequests(
    [
      makePr({
        repo: { owner: "openai", name: "codex", sourceNodeId: "R_1", visibility: "PRIVATE" },
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
}

describe("readSchemaVersion", () => {
  it("returns 0 when the DWH does not exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-mig-"));
    try {
      expect(await readSchemaVersion(join(root, "missing"))).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reads the version stamped by the build", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-mig-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildBaselineDwh(dwhDir);
      expect(await readSchemaVersion(dwhDir)).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("migrateDwh", () => {
  it("is a no-op when the DWH does not exist yet (first-ever build)", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-mig-"));
    const migrations: Migration[] = [{ version: 2, name: "002", up: async () => {} }];
    try {
      const result = await migrateDwh(join(root, "dwh"), { migrations, targetVersion: 2 });
      expect(result).toEqual({ from: 0, to: 0, applied: [] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("is a no-op when the DWH dir exists but is empty (placeholder/.gitkeep)", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-mig-"));
    const dwhDir = join(root, "dwh");
    try {
      // A committed `data/dwh/.gitkeep` makes the dir exist with no _meta.json.
      await mkdir(dwhDir, { recursive: true });
      const result = await migrateDwh(dwhDir, { targetVersion: 1 });
      expect(result).toEqual({ from: 0, to: 0, applied: [] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("is a no-op when already at the target version", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-mig-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildBaselineDwh(dwhDir);
      const result = await migrateDwh(dwhDir, { targetVersion: 1 });
      expect(result).toEqual({ from: 1, to: 1, applied: [] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("applies pending migrations in order, stamps the version, and is idempotent", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-mig-"));
    const dwhDir = join(root, "dwh");
    const order: number[] = [];
    const migrations: Migration[] = [
      {
        version: 3,
        name: "003_third",
        up: async (ctx) => { order.push(3); await writeFile(join(ctx.dwhDir, "v3.marker"), "", "utf8"); },
      },
      {
        version: 2,
        name: "002_second",
        up: async (ctx) => { order.push(2); await writeFile(join(ctx.dwhDir, "v2.marker"), "", "utf8"); },
      },
    ];
    try {
      await buildBaselineDwh(dwhDir);
      const result = await migrateDwh(dwhDir, { migrations, targetVersion: 3 });

      expect(order).toEqual([2, 3]); // sorted by version
      expect(result).toEqual({ from: 1, to: 3, applied: ["002_second", "003_third"] });
      expect(await readSchemaVersion(dwhDir)).toBe(3);
      expect(await fileExists(join(dwhDir, "v2.marker"))).toBe(true);
      expect(await fileExists(join(dwhDir, "v3.marker"))).toBe(true);
      // Baseline data is carried through the staging copy.
      expect(await fileExists(join(dwhDir, "pull_requests.parquet"))).toBe(true);

      // Second run: already current → no-op, migrations not re-run.
      order.length = 0;
      const again = await migrateDwh(dwhDir, { migrations, targetVersion: 3 });
      expect(again.applied).toEqual([]);
      expect(order).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses a DWH written by a newer engine (stored > target)", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-mig-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildBaselineDwh(dwhDir); // stamps version 1
      await expect(migrateDwh(dwhDir, { targetVersion: 0 })).rejects.toThrow(/newer than this engine supports/);
      expect(await readSchemaVersion(dwhDir)).toBe(1); // untouched
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("throws when a migration for an intermediate version is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-mig-"));
    const dwhDir = join(root, "dwh");
    const migrations: Migration[] = [{ version: 3, name: "003", up: async () => {} }];
    try {
      await buildBaselineDwh(dwhDir);
      await expect(migrateDwh(dwhDir, { migrations, targetVersion: 3 })).rejects.toThrow(/Missing DWH migration.*2/);
      // version unchanged after a failed gate
      expect(await readSchemaVersion(dwhDir)).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("leaves the committed DWH intact when a migration throws", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-mig-"));
    const dwhDir = join(root, "dwh");
    const migrations: Migration[] = [
      { version: 2, name: "002_boom", up: async () => { throw new Error("boom"); } },
    ];
    try {
      await buildBaselineDwh(dwhDir);
      await expect(migrateDwh(dwhDir, { migrations, targetVersion: 2 })).rejects.toThrow(/boom/);
      expect(await readSchemaVersion(dwhDir)).toBe(1);
      expect(await fileExists(join(dwhDir, "pull_requests.parquet"))).toBe(true);
      // staging dir cleaned up
      const leftovers = (await readFile(join(dwhDir, "_meta.json"), "utf8")).includes('"dwh_schema_version": 1');
      expect(leftovers).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
