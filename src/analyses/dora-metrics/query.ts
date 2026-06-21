import type { DoraMetrics } from "../../shared/types.js";
import type { DwhQueryRunner } from "../../warehouse/query.js";
import type { Scope } from "../scope.js";
import { inListFilter, timeRangeFilter } from "../scope-sql.js";

// SQL-native DORA. Output matches the `DoraMetrics` view-model the metric-cards
// renderer consumes. Failure classification mirrors dora-metrics/internal: a
// merged PR whose title starts with `Revert "` (GitHub's default revert title)
// is a failure fix — no label discipline required.
//
// Lead time is fractional hours via epoch_ms diff (the tz offset cancels in the
// subtraction), matching the in-memory diffHours to the millisecond.

type DoraRow = {
  deploys: bigint | number;
  p50_lead: number | null;
  failure_count: bigint | number;
  mttr: number | null;
};

/**
 * SQL for the DORA metrics. Exported so DuckDB-WASM (Explore) and DuckDB-native
 * (Reports) run the identical query — parity by shared module (design D4).
 */
export function buildDoraSql(scope: Scope): string {
  const repoFilter = inListFilter("r.repo_key", scope.repos);
  const mergedTime = timeRangeFilter("pr.merged_at", scope);
  const authorUsers = inListFilter("author.login", scope.users);

  return `
    WITH merged AS (
      SELECT pr.pr_id AS pr_id,
             (epoch_ms(pr.merged_at) - epoch_ms(pr.created_at)) / 3600000.0 AS lead_hours,
             -- NULL title yields NULL here and is excluded by FILTER(WHERE is_failure),
             -- matching the in-memory path (the collector guarantees a string title).
             pr.title LIKE 'Revert "%' AS is_failure
      FROM pull_requests pr
      JOIN repos r ON r.repo_id = pr.repo_id
      LEFT JOIN actors author ON author.actor_id = pr.author_actor_id
      WHERE pr.merged_at IS NOT NULL${repoFilter}${mergedTime}${authorUsers}
    )
    SELECT count(*) AS deploys,
           median(lead_hours) AS p50_lead,
           count(*) FILTER (WHERE is_failure) AS failure_count,
           avg(lead_hours) FILTER (WHERE is_failure) AS mttr
    FROM merged
  `;
}

export async function queryDora(runner: DwhQueryRunner, scope: Scope): Promise<DoraMetrics> {
  const rows = await runner.all<DoraRow>(buildDoraSql(scope));

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
