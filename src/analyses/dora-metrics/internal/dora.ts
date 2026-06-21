import type {
  NormalizedPullRequest,
  AggregateMetrics,
  DoraMetrics,
} from "../../../shared/types.js";
import { diffHours } from "../../../shared/datetime.js";
import { average } from "./aggregate.js";

// GitHub's default revert PR title is `Revert "<original title>"`. We detect
// rollbacks by this title prefix instead of relying on hotfix/revert/incident
// labels, which most small teams never apply — so the failure metrics work with
// zero label discipline. Mirrored in dora-metrics/query.ts (SQL) for parity.
const REVERT_TITLE_PREFIX = /^Revert "/;

export function isFailureFix(pr: NormalizedPullRequest): boolean {
  return REVERT_TITLE_PREFIX.test(pr.title);
}

export function computeDora(
  prs: readonly NormalizedPullRequest[],
  aggregate: AggregateMetrics,
): DoraMetrics {
  const mergedPrs = prs.filter((pr) => pr.mergedAt !== null);
  const failureFixes = mergedPrs.filter(isFailureFix);

  const changeFailureRatePercent =
    mergedPrs.length === 0
      ? null
      : (failureFixes.length / mergedPrs.length) * 100;

  const failureLeadTimes = failureFixes
    .map((pr) => (pr.mergedAt ? diffHours(pr.createdAt, pr.mergedAt) : null))
    .filter((v): v is number => v !== null);

  return {
    deploymentFrequency: mergedPrs.length,
    leadTimeForChangesHours: aggregate.medianLeadTimeHours,
    changeFailureRatePercent,
    mttrHours: average(failureLeadTimes),
  };
}
