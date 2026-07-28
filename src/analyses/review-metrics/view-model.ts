/** Review-less merges (2-1): merged PRs that shipped with no review. */
export type ReviewlessMerges = Readonly<{
  mergedCount: number;
  reviewlessCount: number;
  rate: number | null; // reviewlessCount / mergedCount, null when mergedCount = 0
}>;

/** One point of the size × review-pickup scatter (2-3). */
export type SizePickupPoint = Readonly<{
  number: number;
  title: string | null;
  url: string | null;
  repoKey: string;
  pickupHours: number; // open → first review
  sizeLines: number; // additions + deletions
}>;

/** Size × review-pickup scatter (2-3), with truncation metadata for the UI. */
export type SizePickupScatter = Readonly<{
  points: readonly SizePickupPoint[];
  totalMatched: number; // matches before the point cap
  truncated: boolean; // totalMatched > points.length
}>;

/** One reviewer's request→first-review representative time (2-5). */
export type ReviewerLead = Readonly<{
  reviewer: string;
  p50Hours: number | null; // median over responded requests; null when none responded
  respondedCount: number;
  pendingCount: number; // requested but not yet reviewed (censored)
}>;

/** Reviewer-by-reviewer lead times (2-5). */
export type ReviewerLeadTimes = Readonly<{
  reviewers: readonly ReviewerLead[];
}>;
