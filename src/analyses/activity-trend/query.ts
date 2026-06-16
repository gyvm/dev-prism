import type { DwhQueryRunner } from "../../warehouse/query.js";
import type { Scope } from "../scope.js";
import { inListFilter, timeRangeFilter } from "../scope-sql.js";
import type { ActivityTrend, ActivityTrendBucket } from "./view-model.js";

// PR / review / comment counts bucketed at the scope grain, straight off the
// `activities` fact (design: 件数・推移系は activities から date_trunc で集計).
// The grain is validated against a whitelist in resolveScope, so it is safe to
// inline into date_trunc.

type TrendRow = {
  bucket_text: string;
  pr_opened: bigint | number;
  pr_merged: bigint | number;
  reviews: bigint | number;
  comments: bigint | number;
};

function toIso(bucketText: string): string {
  return new Date(`${bucketText.replace(" ", "T")}Z`).toISOString();
}

export async function queryActivityTrend(
  runner: DwhQueryRunner,
  scope: Scope,
): Promise<ActivityTrend> {
  const repoFilter = inListFilter("r.repo_key", scope.repos);
  const timeFilter = timeRangeFilter("a.occurred_at", scope);
  const botFilter = scope.includeBots ? "" : " AND NOT coalesce(act.is_bot, false)";

  const rows = await runner.all<TrendRow>(`
    SELECT CAST(date_trunc('${scope.grain}', a.occurred_at) AS VARCHAR) AS bucket_text,
           count(*) FILTER (WHERE a.event_type = 'pr_opened') AS pr_opened,
           count(*) FILTER (WHERE a.event_type = 'pr_merged') AS pr_merged,
           count(*) FILTER (WHERE a.event_type = 'review_submitted') AS reviews,
           count(*) FILTER (WHERE a.event_type IN ('comment_created', 'review_comment_created')) AS comments
    FROM activities a
    JOIN repos r ON r.repo_id = a.repo_id
    LEFT JOIN actors act ON act.actor_id = a.actor_id
    WHERE TRUE${repoFilter}${timeFilter}${botFilter}
    GROUP BY bucket_text
    ORDER BY bucket_text
  `);

  const buckets: ActivityTrendBucket[] = rows.map((row) => ({
    bucket: toIso(row.bucket_text),
    prOpened: Number(row.pr_opened),
    prMerged: Number(row.pr_merged),
    reviews: Number(row.reviews),
    comments: Number(row.comments),
  }));

  return { grain: scope.grain, buckets };
}
