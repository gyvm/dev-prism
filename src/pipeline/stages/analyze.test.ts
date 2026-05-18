import { describe, expect, it } from "vitest";

import { DEFAULT_LIMITS } from "../../shared/config.js";
import {
  analyzeStage,
  discoverAiSkillIds,
} from "./analyze.js";
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
  it("runs compute analyses and skips AI skills when skipAi is true", async () => {
    const result = await analyzeStage(period, [buildPr()], {
      limits: DEFAULT_LIMITS,
      timezone: "UTC",
      now: new Date("2026-05-03T12:00:00Z"),
skipAi: true,
      skillsRoot: "skills",
    });

    const byId = Object.fromEntries(result.results.map((r) => [r.id, r]));
    expect(byId["dora-metrics"]?.status).toBe("ok");
    expect(byId["pr-timeline"]?.status).toBe("ok");
    expect(byId["01_project-progress"]?.status).toBe("skipped");
    expect(byId["01_project-progress"]?.reason).toMatch(/skipped/i);
  });

  it("invokes AI runner with skillId and full payload, output is markdown", async () => {
    const calls: { skillId: string; prCount: number }[] = [];
    const runner: AiRunner = async ({ skillId, payload }) => {
      const p = payload as { prs: readonly unknown[] };
      calls.push({ skillId, prCount: p.prs.length });
      return `## ${skillId}\n\nstubbed output`;
    };
    const result = await analyzeStage(period, [buildPr()], {
      limits: DEFAULT_LIMITS,
      timezone: "UTC",
      now: new Date("2026-05-03T12:00:00Z"),
aiRunner: runner,
      skillsRoot: "skills",
    });

    expect(calls.map((c) => c.skillId).sort()).toEqual([
      "01_project-progress",
      "02_follow-up-prs",
      "03_debated-prs",
    ]);
    const ai = result.results.find((r) => r.id === "01_project-progress");
    expect(ai?.status).toBe("ok");
    expect(ai?.format).toBe("markdown");
    expect(ai?.data).toMatch(/^## 01_project-progress/);
  });

  it("orders compute analyses then AI skills by directory prefix", async () => {
    const result = await analyzeStage(period, [buildPr()], {
      limits: DEFAULT_LIMITS,
      timezone: "UTC",
      now: new Date("2026-05-03T12:00:00Z"),
skipAi: true,
      skillsRoot: "skills",
    });

    expect(result.results.map((r) => r.id)).toEqual([
      "dora-metrics",
      "pr-timeline",
      "review-correlation",
      "01_project-progress",
      "02_follow-up-prs",
      "03_debated-prs",
    ]);
  });
});

describe("discoverAiSkillIds", () => {
  it("returns all skill directories with a SKILL.md", async () => {
    const ids = await discoverAiSkillIds("skills");
    expect(ids).toEqual(["01_project-progress", "02_follow-up-prs", "03_debated-prs"]);
  });

  it("returns empty list for missing root", async () => {
    const ids = await discoverAiSkillIds("/tmp/does/not/exist/anywhere");
    expect(ids).toEqual([]);
  });
});
