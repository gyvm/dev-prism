export type DevPrismPrCandidate = Readonly<{
  repo: string;
  number: number;
  title: string;
  url: string | null;
  author: string | null;
  metric: string;
}>;

export type DevPrismSummary = Readonly<{
  flowSnapshot: Readonly<{
    leadTimeHours: number | null;
    previousLeadTimeHours: number | null;
    leadTimeDeltaHours: number | null;
    mergedPrCount: number;
    previousMergedPrCount: number;
    mergedPrDelta: number;
    averageReviewWaitHours: number | null;
    previousAverageReviewWaitHours: number | null;
    reviewWaitDeltaHours: number | null;
    activePrCount: number;
    analystComment: string;
  }>;
  whatChanged: Readonly<{
    longLeadTimePrs: readonly DevPrismPrCandidate[];
    longReviewWaitPrs: readonly DevPrismPrCandidate[];
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
