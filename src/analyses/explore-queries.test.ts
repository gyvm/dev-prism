import { describe, expect, it } from "vitest";

import { buildDashboardSql } from "./explore-queries.js";
import { resolveScope } from "./scope.js";

describe("buildDashboardSql", () => {
  it("emits SQL for every dashboard analysis", () => {
    const sql = buildDashboardSql(resolveScope());
    expect(sql.activityTrend).toContain("FROM activities");
    expect(sql.dora).toContain("FROM pull_requests");
    expect(sql.reviewCorrelation.authors).toContain("FROM pull_requests");
    expect(sql.reviewCorrelation.reviewers).toContain("review_pairs");
    expect(sql.reviewCorrelation.pairs).toContain("review_pairs");
  });

  it("reflects scope filters in the generated SQL", () => {
    const sql = buildDashboardSql(
      resolveScope({
        repos: ["openai/codex"],
        includeBots: false,
        grain: "month",
        from: new Date("2026-04-01T00:00:00.000Z"),
        to: new Date("2026-04-30T00:00:00.000Z"),
      }),
    );
    expect(sql.activityTrend).toContain("date_trunc('month'");
    expect(sql.activityTrend).toContain("r.repo_key IN ('openai/codex')");
    expect(sql.activityTrend).toContain("NOT coalesce(act.is_bot, false)");
    expect(sql.dora).toContain("pr.merged_at >= TIMESTAMP '2026-04-01 00:00:00.000'");
    expect(sql.reviewCorrelation.authors).toContain("NOT a.is_bot");
  });

  it("omits filters for the default (everything) scope", () => {
    const sql = buildDashboardSql(resolveScope());
    expect(sql.activityTrend).not.toContain("repo_key IN (");
    expect(sql.activityTrend).not.toContain("act.login IN (");
    expect(sql.activityTrend).not.toContain("NOT coalesce(act.is_bot, false)");
    expect(sql.activityTrend).toContain("date_trunc('week'");
  });
});
