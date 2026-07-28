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
    expect(sql.cycleFunnel).toContain("first_commit AS");
    expect(sql.cycleFunnel).toContain("'commit_to_open'");
    expect(sql.leadTrend).toContain("date_trunc('week'");
    expect(sql.reviewlessMerges).toContain("first_review_at IS NULL");
    expect(sql.sizePickupScatter).toContain("count(*) OVER ()");
    expect(sql.sizePickupScatter).toContain("LIMIT 2000");
    expect(sql.reviewerLead).toContain("review_requested");
    expect(sql.reviewerLead).toContain("review_submitted");
  });

  it("excludes negative cycle-time stages via >= 0 filters", () => {
    const sql = buildDashboardSql(resolveScope());
    expect(sql.cycleFunnel).toContain("FILTER (WHERE s1 >= 0)");
    expect(sql.leadTrend).toContain("FILTER (WHERE s4 >= 0)");
  });

  it("recomputes human-only review timestamps when bots are excluded", () => {
    const withBots = buildDashboardSql(resolveScope({ includeBots: true }));
    const noBots = buildDashboardSql(resolveScope({ includeBots: false }));
    // Bots included: precomputed columns, no recompute CTE.
    expect(withBots.cycleFunnel).not.toContain("human_review AS");
    expect(withBots.reviewlessMerges).toContain("pr.first_review_at IS NULL");
    // Bots excluded: recompute CTE for the funnel, NOT EXISTS for review-less.
    expect(noBots.cycleFunnel).toContain("human_review AS");
    expect(noBots.cycleFunnel).toContain("hr.first_review_at");
    expect(noBots.reviewlessMerges).toContain("NOT EXISTS");
    expect(noBots.sizePickupScatter).toContain("human_review AS");
  });

  it("honors a custom scatter point cap from thresholds", () => {
    const sql = buildDashboardSql(resolveScope({ thresholds: { scatterMaxPoints: 500 } }));
    expect(sql.sizePickupScatter).toContain("LIMIT 500");
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
