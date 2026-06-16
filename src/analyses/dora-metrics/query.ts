import type { DoraMetrics } from "../../shared/types.js";
import type { DwhQueryRunner } from "../../warehouse/query.js";
import type { Scope } from "../scope.js";
import { inListFilter, timeRangeFilter } from "../scope-sql.js";

// SQL-native DORA. Output matches the `DoraMetrics` view-model the metric-cards
// renderer consumes. Failure classification mirrors dora-metrics/internal: a
// merged PR carrying a hotfix/revert/incident label is a failure fix.
//
// Lead time is fractional hours via epoch_ms diff (the tz offset cancels in the
// subtraction), matching the in-memory diffHours to the millisecond.

const FAILURE_LABELS = ["hotfix", "revert", "incident"];

type DoraRow = {
  deploys: bigint | number;
  p50_lead: number | null;
  failure_count: bigint | number;
  mttr: number | null;
};

export async function queryDora(runner: DwhQueryRunner, scope: Scope): Promise<DoraMetrics> {
  const repoFilter = inListFilter("r.repo_key", scope.repos);
  const mergedTime = timeRangeFilter("pr.merged_at", scope);
  const failureList = FAILURE_LABELS.map((label) => `'${label}'`).join(", ");

  const rows = await runner.all<DoraRow>(`
    WITH merged AS (
      SELECT pr.pr_id AS pr_id,
             (epoch_ms(pr.merged_at) - epoch_ms(pr.created_at)) / 3600000.0 AS lead_hours,
             EXISTS (
               SELECT 1 FROM pr_labels l
               WHERE l.pr_id = pr.pr_id AND lower(l.label) IN (${failureList})
             ) AS is_failure
      FROM pull_requests pr
      JOIN repos r ON r.repo_id = pr.repo_id
      WHERE pr.merged_at IS NOT NULL${repoFilter}${mergedTime}
    )
    SELECT count(*) AS deploys,
           median(lead_hours) AS p50_lead,
           count(*) FILTER (WHERE is_failure) AS failure_count,
           avg(lead_hours) FILTER (WHERE is_failure) AS mttr
    FROM merged
  `);

  const row = rows[0] ?? { deploys: 0, p50_lead: null, failure_count: 0, mttr: null };
  const deploys = Number(row.deploys);
  const failureCount = Number(row.failure_count);

  return {
    deploymentFrequency: deploys,
    leadTimeForChangesHours: deploys === 0 ? null : row.p50_lead,
    changeFailureRatePercent: deploys === 0 ? null : (failureCount / deploys) * 100,
    mttrHours: failureCount === 0 ? null : row.mttr,
  };
}
