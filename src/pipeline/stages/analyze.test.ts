import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_LIMITS } from "../../shared/config.js";
import { analyzeStage } from "./analyze.js";
import { AI_REGISTRY } from "../../analyses/ai/registry.js";
import type { Period } from "../period.js";
import type { AiRunner } from "../ai-runner.js";
import type { NormalizedPullRequest } from "../../shared/types.js";

const period: Period = {
  id: "2026-05-03",
  start: new Date("2026-04-27T00:00:00Z"),
  end: new Date("2026-05-03T23:59:59Z"),
};

function buildPr(): NormalizedPullRequest {
  return {
    repo: { owner: "acme", name: "demo" },
    number: 1,
    state: "MERGED",
    title: "test PR",
    bodyText: "",
    url: "https://example.com/pr/1",
    author: "alice",
    createdAt: "2026-04-28T10:00:00Z",
    updatedAt: "2026-04-29T10:00:00Z",
    mergedAt: "2026-04-29T10:00:00Z",
    closedAt: null,
    additions: 10,
    deletions: 5,
    labels: [],
    comments: [],
    reviewThreads: [],
    reviews: [
      {
        author: "bob",
        state: "APPROVED",
        submittedAt: "2026-04-28T16:00:00Z",
        bodyText: null,
      },
    ],
    reviewRequests: [],
    isDraft: false,
    timelineEvents: [],
    files: [],
    commits: [],
  };
}

describe("analyzeStage", () => {
  let tmpDir: string;
  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gh-insights-analyze-"));
  });
  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("runs compute analyses and skips AI analyses when skipAi is true", async () => {
    const result = await analyzeStage(period, [buildPr()], {
      limits: DEFAULT_LIMITS,
      timezone: "UTC",
      now: new Date("2026-05-03T12:00:00Z"),
      outputRoot: tmpDir,
      skipAi: true,
    });

    const byId = Object.fromEntries(result.results.map((r) => [r.id, r]));
    expect(byId["dev-prism-summary"]?.status).toBe("ok");
    expect(byId["dora-metrics"]?.status).toBe("ok");
    expect(byId["pr-timeline"]?.status).toBe("ok");
    expect(byId["flow-analyst"]?.status).toBe("skipped");
    expect(byId["project-progress"]?.status).toBe("skipped");
    expect(byId["project-progress"]?.reason).toMatch(/skipped/i);
  });

  it("invokes the AI runner with the registered prompt and full payload", async () => {
    const calls: { id: string; prCount: number; promptHead: string }[] = [];
    const runner: AiRunner = async ({ id, prompt, payload }) => {
      const p = payload as { prs: readonly unknown[] };
      calls.push({ id, prCount: p.prs.length, promptHead: prompt.slice(0, 24) });
      return `## ${id}\n\nstubbed output`;
    };
    const result = await analyzeStage(period, [buildPr()], {
      limits: DEFAULT_LIMITS,
      timezone: "UTC",
      now: new Date("2026-05-03T12:00:00Z"),
      outputRoot: tmpDir,
      aiRunner: runner,
    });

    expect(calls.map((c) => c.id).sort()).toEqual(
      [...Object.keys(AI_REGISTRY)].sort(),
    );
    // the runner receives the embedded prompt body, not a "use skill" indirection
    const flow = calls.find((c) => c.id === "flow-analyst");
    expect(flow?.promptHead).toBe(AI_REGISTRY["flow-analyst"]!.prompt.slice(0, 24));

    const ai = result.results.find((r) => r.id === "project-progress");
    expect(ai?.status).toBe("ok");
    expect(ai?.format).toBe("markdown");
    expect(ai?.data).toMatch(/^## project-progress/);
  });

  it("orders compute analyses (registry order) before AI analyses (registry order)", async () => {
    const result = await analyzeStage(period, [buildPr()], {
      limits: DEFAULT_LIMITS,
      timezone: "UTC",
      now: new Date("2026-05-03T12:00:00Z"),
      outputRoot: tmpDir,
      skipAi: true,
    });

    expect(result.results.map((r) => r.id)).toEqual([
      "dev-prism-summary",
      "dora-metrics",
      "pr-timeline",
      "review-correlation",
      ...Object.keys(AI_REGISTRY),
    ]);
  });
});
