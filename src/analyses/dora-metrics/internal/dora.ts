import type {
  NormalizedPullRequest,
  AggregateMetrics,
  DoraMetrics,
} from "../../../shared/types.js";
import { diffHours } from "../../../shared/datetime.js";
import { average } from "./aggregate.js";

const FAILURE_LABELS = new Set(["hotfix", "revert", "incident"]);

export function isFailureFix(pr: NormalizedPullRequest): boolean {
  return pr.labels.some((label) =>
    FAILURE_LABELS.has(label.name.toLowerCase()),
  );
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
