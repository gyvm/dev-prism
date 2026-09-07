import { describe, expect, it } from "vitest";

import { buildAnalysisContext } from "./analysis-context.js";
import type { DwhQueryRunner } from "../warehouse/runner.js";
import { resolveScope } from "../analyses/scope.js";

const NOW = new Date("2026-09-07T00:00:00.000Z");

function trendRows(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({
    bucket_text: `2026-01-${String((index % 28) + 1).padStart(2, "0")} 00:00:00`,
    pr_opened: 2,
    pr_merged: 1,
    reviews: 3,
    comments: 4,
    s1_p50: 1,
    s1_n: 2,
    s2_p50: 2,
    s2_n: 2,
    s3_p50: 3,
    s3_n: 2,
    s4_p50: 4,
    s4_n: 2,
  }));
}

function fakeRunner(): DwhQueryRunner {
  return {
    async all(sql: string): Promise<Record<string, unknown>[]> {
      if (sql.includes("SELECT count(*) AS deploys")) {
        return [{ deploys: 4, p50_lead: 24, failure_count: 1, mttr: 12 }];
      }
      if (sql.includes("SELECT 1 AS stage")) {
        return [
          { stage: 1, stage_key: "commit_to_open", p50_hours: 1, n: 4 },
          { stage: 2, stage_key: "open_to_review", p50_hours: 20, n: 4 },
          { stage: 3, stage_key: "review_to_approve", p50_hours: 3, n: 4 },
          { stage: 4, stage_key: "approve_to_merge", p50_hours: 4, n: 4 },
        ];
      }
      if (sql.includes("s1_p50")) return trendRows(60);
      if (sql.includes("pr_opened")) return trendRows(60);
      if (sql.includes("merged_n")) return [{ merged_n: 4, reviewless_n: 1 }];
      if (sql.includes("AS responded_n")) {
        return [{ reviewer: "reviewer-a", p50_hours: 5, responded_n: 3, pending_n: 1 }];
      }
      if (sql.includes("SELECT a.login AS login")) {
        return [{ login: "author-a", pr_count: 4, is_bot: false }];
      }
      if (sql.includes("SELECT reviewer AS login")) {
        return [{ login: "reviewer-a", review_count: 4, is_bot: false }];
      }
      if (sql.includes("SELECT author, reviewer")) {
        return [{ author: "author-a", reviewer: "reviewer-a", cnt: 4 }];
      }
      if (sql.includes("open_n")) {
        return [{ open_n: 3, awaiting_review_n: 2, oldest_age_days: 14 }];
      }
      if (sql.includes("SELECT bucket, count(*) AS n")) {
        return [{ bucket: "14d+", n: 3 }];
      }
      throw new Error(`Unhandled SQL in fake runner: ${sql.slice(0, 80)}`);
    },
  };
}

describe("buildAnalysisContext", () => {
  const scope = resolveScope({
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-03-31T23:59:59.999Z",
    repos: ["acme/app"],
    users: ["author-a"],
    includeBots: false,
    grain: "week",
  });

  it("builds all four views from aggregate view models", async () => {
    const contexts = await Promise.all(
      (["flow", "review", "timeline", "wip"] as const).map((templateId) =>
        buildAnalysisContext(fakeRunner(), templateId, scope, NOW, "https://example.test/explore/flow/"),
      ),
    );

    expect(contexts.map((context) => context.templateId)).toEqual([
      "flow",
      "review",
      "timeline",
      "wip",
    ]);
    expect(contexts[0]?.scope).toMatchObject({
      from: scope.from?.toISOString(),
      to: scope.to?.toISOString(),
      repos: ["acme/app"],
      users: ["author-a"],
      includeBots: false,
      grain: "week",
    });
    expect(contexts[0]?.data.kind).toBe("flow");
    expect(contexts[0]?.data.kind === "flow" && contexts[0].data.activityTrend.buckets).toHaveLength(52);
    expect(contexts[0]?.truncated).toBe(true);
    expect(contexts[1]?.data.kind).toBe("review");
    expect(contexts[2]?.data.kind).toBe("timeline");
    expect(contexts[3]?.data.kind).toBe("wip");
    expect(contexts[3]?.scope).toMatchObject({ from: null, to: null });
    expect(contexts[3]?.requestedScope).toMatchObject({
      from: scope.from?.toISOString(),
      to: scope.to?.toISOString(),
    });
    expect(contexts[3]?.asOf).toBe(NOW.toISOString());
  });

  it("keeps unavailable period comparisons as null and does not include PR content fields", async () => {
    const context = await buildAnalysisContext(
      fakeRunner(),
      "flow",
      resolveScope({ repos: ["acme/app"] }),
      NOW,
    );
    expect(context.data.kind === "flow" && context.data.dora.previous).toBeNull();
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("bodyText");
    expect(serialized).not.toContain("title");
    expect(serialized).not.toContain("url");
    expect(serialized).not.toContain("number");
  });
});
