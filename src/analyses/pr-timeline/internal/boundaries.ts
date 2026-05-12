import type {
  NormalizedPullRequest,
  TimelineClosingState,
  TimelineSegment,
  TimelineState,
} from "../../../shared/types.js";
import { diffHours } from "../../../shared/datetime.js";
import { MetricsError } from "../../../shared/errors.js";

export function earliest(values: readonly (string | null | undefined)[]): string | null {
  let minStr: string | null = null;
  let minMs = Infinity;
  for (const value of values) {
    if (typeof value !== "string") continue;
    const ms = new Date(value).getTime();
    if (Number.isNaN(ms)) {
      throw new MetricsError(`Invalid date in earliest(): "${value}"`);
    }
    if (ms < minMs) {
      minMs = ms;
      minStr = value;
    }
  }
  return minStr;
}

export function firstAuthoredDate(pr: NormalizedPullRequest): string | null {
  return earliest(pr.commits.map((c) => c.authoredDate));
}

export function readyForReviewAt(pr: NormalizedPullRequest): string | null {
  const ready = earliest(
    pr.timelineEvents
      .filter((e) => e.type === "ready_for_review")
      .map((e) => e.createdAt),
  );
  if (ready !== null) return ready;
  return pr.isDraft ? null : pr.createdAt;
}

export function firstApproveAt(pr: NormalizedPullRequest): string | null {
  return earliest(
    pr.reviews
      .filter((r) => r.state === "APPROVED" && r.submittedAt !== null)
      .map((r) => r.submittedAt),
  );
}

export function closingStateOf(pr: NormalizedPullRequest): TimelineClosingState {
  if (pr.mergedAt !== null) return "merged";
  if (pr.closedAt !== null) return "closed_unmerged";
  return "open";
}

export function makeSegment(
  state: TimelineState,
  start: string,
  end: string,
): TimelineSegment {
  const duration = Math.max(0, diffHours(start, end));
  return { state, startAt: start, endAt: end, durationHours: duration };
}
