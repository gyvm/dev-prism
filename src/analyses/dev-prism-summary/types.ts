export type DevPrismTrend = "improved" | "worse" | "flat" | "unknown";

export type DevPrismMetric = Readonly<{
  label: string;
  value: string;
  detail: string;
  trend: DevPrismTrend;
}>;

export type DevPrismPrCandidate = Readonly<{
  repo: string;
  number: number;
  title: string;
  url: string | null;
  author: string | null;
  metric: string;
  reason: string;
  prompt: string;
}>;

export type DevPrismSummary = Readonly<{
  flowSnapshot: Readonly<{
    leadTimeHours: number | null;
    mergedPrCount: number;
    averageReviewWaitHours: number | null;
    activePrCount: number;
    analystComment: string;
    metrics: readonly DevPrismMetric[];
  }>;
  whatChanged: Readonly<{
    longLeadTimePrs: readonly DevPrismPrCandidate[];
    longReviewWaitPrs: readonly DevPrismPrCandidate[];
    largePrs: readonly DevPrismPrCandidate[];
    debatedPrs: readonly DevPrismPrCandidate[];
  }>;
  rememberThisWeek: Readonly<{
    quickWins: readonly DevPrismPrCandidate[];
    smallButUseful: readonly DevPrismPrCandidate[];
    collaborativePrs: readonly DevPrismPrCandidate[];
  }>;
  needsFollowUp: Readonly<{
    staleOpenPrs: readonly DevPrismPrCandidate[];
    unresolvedReviewPrs: readonly DevPrismPrCandidate[];
    waitingAfterCommentPrs: readonly DevPrismPrCandidate[];
  }>;
}>;
