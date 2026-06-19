import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makePr } from "../test-fixtures.js";
import { buildDwhFromPullRequests } from "./build.js";
import {
  DEFAULT_OVERLAP_MINUTES,
  readRepoLowWatermarks,
  readRepoWatermarks,
  resolveCollectionWindow,
  resolveSince,
} from "./watermark.js";

function pr(overrides: Parameters<typeof makePr>[0] = {}): ReturnType<typeof makePr> {
  return makePr({
    repo: { owner: "openai", name: "codex", sourceNodeId: "R_1", visibility: "PRIVATE" },
    sourceNodeId: "PR_1",
    number: 1,
    title: "PR",
    author: "alice",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-21T00:00:00.000Z",
    additions: 1,
    deletions: 0,
    ...overrides,
  });
}

describe("readRepoWatermarks", () => {
  it("returns an empty map when the DWH does not exist yet", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-wm-"));
    try {
      const watermarks = await readRepoWatermarks(join(root, "missing"));
      expect(watermarks.size).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns max(updated_at) per repo_key from a built DWH", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-wm-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildDwhFromPullRequests(
        [
          pr({ sourceNodeId: "PR_1", number: 1, updatedAt: "2026-04-21T00:00:00.000Z" }),
          pr({ sourceNodeId: "PR_2", number: 2, updatedAt: "2026-04-25T12:00:00.000Z" }),
          pr({
            repo: { owner: "openai", name: "evals", sourceNodeId: "R_2", visibility: "PUBLIC" },
            sourceNodeId: "PR_3",
            number: 3,
            updatedAt: "2026-04-22T06:00:00.000Z",
          }),
        ],
        { dwhDir, botPatterns: [] },
      );

      const watermarks = await readRepoWatermarks(dwhDir);

      expect(watermarks.get("openai/codex")?.toISOString()).toBe("2026-04-25T12:00:00.000Z");
      expect(watermarks.get("openai/evals")?.toISOString()).toBe("2026-04-22T06:00:00.000Z");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("readRepoLowWatermarks", () => {
  it("returns min(updated_at) per repo_key from a built DWH", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-wm-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildDwhFromPullRequests(
        [
          pr({ sourceNodeId: "PR_1", number: 1, updatedAt: "2026-04-21T00:00:00.000Z" }),
          pr({ sourceNodeId: "PR_2", number: 2, updatedAt: "2026-04-25T12:00:00.000Z" }),
          pr({
            repo: { owner: "openai", name: "evals", sourceNodeId: "R_2", visibility: "PUBLIC" },
            sourceNodeId: "PR_3",
            number: 3,
            updatedAt: "2026-04-22T06:00:00.000Z",
          }),
        ],
        { dwhDir, botPatterns: [] },
      );

      const low = await readRepoLowWatermarks(dwhDir);

      expect(low.get("openai/codex")?.toISOString()).toBe("2026-04-21T00:00:00.000Z");
      expect(low.get("openai/evals")?.toISOString()).toBe("2026-04-22T06:00:00.000Z");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("resolveSince", () => {
  const fallback = new Date("2026-01-01T00:00:00.000Z");

  it("falls back to the static cutoff when the repo has no watermark", () => {
    expect(resolveSince("openai/codex", new Map(), fallback)).toBe(fallback);
  });

  it("subtracts the overlap from a repo watermark", () => {
    const watermarks = new Map([["openai/codex", new Date("2026-04-25T12:00:00.000Z")]]);
    const since = resolveSince("openai/codex", watermarks, fallback, 120);
    expect(since.toISOString()).toBe("2026-04-25T10:00:00.000Z");
  });

  it("uses a default overlap when none is given", () => {
    const watermark = new Date("2026-04-25T12:00:00.000Z");
    const since = resolveSince("openai/codex", new Map([["openai/codex", watermark]]), fallback);
    expect(since.getTime()).toBe(watermark.getTime() - DEFAULT_OVERLAP_MINUTES * 60_000);
  });
});

describe("resolveCollectionWindow", () => {
  const fallbackCutoff = new Date("2026-01-01T00:00:00.000Z");
  const high = new Map([["openai/codex", new Date("2026-04-25T12:00:00.000Z")]]);
  const low = new Map([["openai/codex", new Date("2026-03-10T00:00:00.000Z")]]);

  it("incremental: resumes from the high watermark minus overlap, no upper bound", () => {
    const window = resolveCollectionWindow("openai/codex", {
      highWatermarks: high,
      lowWatermarks: new Map(),
      fallbackCutoff,
      overlapMinutes: 120,
    });
    expect(window).toEqual({ since: new Date("2026-04-25T10:00:00.000Z") });
  });

  it("incremental: falls back to the static cutoff for an unseen repo", () => {
    const window = resolveCollectionWindow("openai/evals", {
      highWatermarks: high,
      lowWatermarks: new Map(),
      fallbackCutoff,
    });
    expect(window).toEqual({ since: fallbackCutoff });
  });

  it("backfill: fetches the full range from `from` when the repo has no rows", () => {
    const from = new Date("2025-06-01T00:00:00.000Z");
    const window = resolveCollectionWindow("openai/evals", {
      highWatermarks: high,
      lowWatermarks: low,
      fallbackCutoff,
      from,
    });
    expect(window).toEqual({ since: from });
  });

  it("backfill: fetches only the uncovered older slice [from, low]", () => {
    const from = new Date("2025-06-01T00:00:00.000Z");
    const window = resolveCollectionWindow("openai/codex", {
      highWatermarks: high,
      lowWatermarks: low,
      fallbackCutoff,
      from,
    });
    expect(window).toEqual({ since: from, until: new Date("2026-03-10T00:00:00.000Z") });
  });

  it("backfill: skips a repo whose history already reaches `from`", () => {
    const from = new Date("2026-03-10T00:00:00.000Z");
    const window = resolveCollectionWindow("openai/codex", {
      highWatermarks: high,
      lowWatermarks: low,
      fallbackCutoff,
      from,
    });
    expect(window).toBeNull();
  });
});
