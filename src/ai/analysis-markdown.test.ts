import { describe, expect, it } from "vitest";

import { buildAnalysisContext } from "./analysis-context.js";
import { buildAnalysisMarkdown } from "./analysis-markdown.js";
import { getAnalysisPrompt } from "./analysis-prompts.js";
import { resolveScope } from "../analyses/scope.js";
import type { DwhQueryRunner } from "../warehouse/runner.js";

function emptyRunner(): DwhQueryRunner {
  return {
    async all(): Promise<Record<string, unknown>[]> {
      return [];
    },
  };
}

describe("analysis prompts", () => {
  it("has one prompt for each Explore view", () => {
    for (const id of ["flow", "review", "timeline", "wip"] as const) {
      const prompt = getAnalysisPrompt(id);
      expect(prompt.id).toBe(id);
      expect(prompt.view).toBe(id);
      expect(prompt.buildPrompt).toBeTypeOf("function");
    }
  });

  it("is deterministic, bounded, and excludes PR-level content", async () => {
    const context = await buildAnalysisContext(
      emptyRunner(),
      "wip",
      resolveScope({ repos: ["acme/app"], users: ["reviewer-a"] }),
      new Date("2026-09-07T00:00:00.000Z"),
      "https://example.test/explore/wip/",
    );
    const prompt = getAnalysisPrompt("wip");
    const first = prompt.buildPrompt(context);
    const second = prompt.buildPrompt(context);

    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(30_000);
    expect(first).toContain("# Dev Prism AI Analysis");
    expect(first).toContain("## Scope");
    expect(first).toContain("## Metric definitions");
    expect(first).toContain("## Aggregated data");
    expect(first).toContain("## Limitations");
    expect(first).toContain("https://example.test/explore/wip/");
    expect(first).toContain("オープンPRがないため");
    expect(first).not.toContain("bodyText");
    expect(first).not.toContain("pr_reviews");
  });

  it("compacts large reviewer and trend aggregates before the character limit", async () => {
    const manyTrendRows = Array.from({ length: 120 }, (_, index) => ({
      bucket_text: `2026-01-${String((index % 28) + 1).padStart(2, "0")} 00:00:00`,
      pr_opened: 1,
      pr_merged: 1,
      reviews: 1,
      comments: 1,
    }));
    const manyAuthors = Array.from({ length: 1_000 }, (_, index) => ({
      login: `author-${index}`,
      pr_count: index,
      is_bot: false,
    }));
    const largeRunner: DwhQueryRunner = {
      async all(sql: string): Promise<Record<string, unknown>[]> {
        if (sql.includes("merged_n")) return [{ merged_n: 10, reviewless_n: 2 }];
        if (sql.includes("pr_opened")) return manyTrendRows;
        if (sql.includes("SELECT a.login AS login")) return manyAuthors;
        if (sql.includes("SELECT reviewer AS login")) {
          return manyAuthors.map((row) => ({
            login: row.login,
            review_count: row.pr_count,
            is_bot: false,
          }));
        }
        if (sql.includes("SELECT author, reviewer")) {
          return manyAuthors.map((row) => ({ author: row.login, reviewer: "reviewer", cnt: row.pr_count }));
        }
        if (sql.includes("AS responded_n")) {
          return manyAuthors.map((row) => ({
            reviewer: row.login,
            p50_hours: row.pr_count,
            responded_n: row.pr_count,
            pending_n: 0,
          }));
        }
        throw new Error("Unexpected SQL");
      },
    };
    const context = await buildAnalysisContext(
      largeRunner,
      "review",
      resolveScope(),
      new Date("2026-09-07T00:00:00.000Z"),
    );

    const markdown = getAnalysisPrompt("review").buildPrompt(context);
    expect(markdown.length).toBeLessThanOrEqual(30_000);
    expect(markdown).toContain("Markdownの上限に合わせ");
  });
});
