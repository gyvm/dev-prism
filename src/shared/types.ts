export type RepositoryConfig = {
  owner: string;
  name: string;
};

export type RepositorySpec =
  | { readonly kind: "concrete"; readonly owner: string; readonly name: string }
  | { readonly kind: "wildcard"; readonly owner: string };

export type RepoConfig = Readonly<{
  repositories: readonly RepositorySpec[];
  timezone: string;
}>;

export type RuntimeConfig = Readonly<{
  githubToken: string | null;
  githubAppId: string | null;
  githubAppPrivateKey: string | null;
  githubAppInstallationId: number | null;
  lookbackDays: number;
  firstReviewThresholdHours: number;
  cutoffDate: Date;
}>;

export type ReviewState =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "COMMENTED"
  | "DISMISSED"
  | "PENDING";

export type NormalizedActor = Readonly<{
  sourceNodeId: string | null;
  type: string | null;
  login: string | null;
  slug: string | null;
  name: string | null;
  url: string | null;
}>;

export type NormalizedPullRequest = Readonly<{
  repo: RepositoryConfig;
  sourceNodeId?: string | null;
  number: number;
  title: string;
  bodyText?: string | null;
  url?: string | null;
  state?: string | null;
  author: string | null;
  authorActor?: NormalizedActor | null;
  mergedByActor?: NormalizedActor | null;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
  labels: readonly { name: string }[];
  reviews: readonly {
    sourceNodeId?: string | null;
    author: string | null;
    authorActor?: NormalizedActor | null;
    state: ReviewState | null;
    submittedAt: string | null;
    updatedAt?: string | null;
    commitOid?: string | null;
    url?: string | null;
    bodyText?: string | null;
  }[];
  reviewRequests: readonly {
    sourceNodeId?: string | null;
    requestedReviewer: string | null;
    requestedReviewerActor?: NormalizedActor | null;
    asCodeOwner?: boolean | null;
  }[];
  isDraft: boolean;
  timelineEvents: readonly {
    sourceNodeId?: string | null;
    type: "ready_for_review" | "review_requested";
    createdAt: string;
    actor?: NormalizedActor | null;
    requestedReviewerActor?: NormalizedActor | null;
  }[];
  comments: readonly {
    sourceNodeId?: string | null;
    author: string | null;
    authorActor?: NormalizedActor | null;
    bodyText: string;
    createdAt: string;
    updatedAt: string | null;
    url: string | null;
  }[];
  reviewThreads: readonly {
    sourceNodeId?: string | null;
    isResolved: boolean | null;
    isOutdated: boolean | null;
    path: string | null;
    line: number | null;
    startLine: number | null;
    subjectType?: string | null;
    resolvedByActor?: NormalizedActor | null;
    comments: readonly {
      sourceNodeId?: string | null;
      author: string | null;
      authorActor?: NormalizedActor | null;
      bodyText: string;
      createdAt: string;
      updatedAt: string | null;
      url: string | null;
      path: string | null;
      line: number | null;
      startLine?: number | null;
      originalLine?: number | null;
      state?: string | null;
      isOutdated?: boolean | null;
      reviewSourceNodeId?: string | null;
    }[];
  }[];
  commits: readonly {
    oid: string;
    committedDate: string;
    authoredDate: string;
    messageHeadline: string;
    author: string | null;
    authorActor?: NormalizedActor | null;
    authorName?: string | null;
    authorEmail?: string | null;
  }[];
  files?: readonly {
    path: string;
    additions: number;
    deletions: number;
    changeType: string | null;
  }[];
}>;

export type CollectorDependencies = {
  fetchFn?: typeof fetch;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  configPath?: string;
  authFactory?: AppAuthFactory;
};

export type AppAuthFactory = (options: {
  appId: string;
  privateKey: string;
  installationId: number;
}) => Promise<string>;

// --- Metrics types ---

export function formatRepoSlug(repo: RepositoryConfig): string {
  return `${repo.owner}/${repo.name}`;
}

export type PrSizeBucket = "small" | "medium" | "large";

export type PrMetrics = Pick<
  NormalizedPullRequest,
  "repo" | "number" | "title" | "author" | "createdAt" | "mergedAt"
> & {
  readonly leadTimeHours: number | null;
  readonly timeToFirstReviewHours: number | null;
  readonly timeToMergeAfterFirstReviewHours: number | null;
  readonly firstReviewedAt: string | null;
  readonly prSize: PrSizeBucket;
  readonly totalLinesChanged: number;
};

export type AggregateMetrics = Readonly<{
  totalPrCount: number;
  mergedPrCount: number;
  noReviewCount: number;
  thresholdExceededCount: number;
  averageLeadTimeHours: number | null;
  medianLeadTimeHours: number | null;
  p90LeadTimeHours: number | null;
  averageTimeToFirstReviewHours: number | null;
}>;

export type DoraMetrics = Readonly<{
  deploymentFrequency: number;
  leadTimeForChangesHours: number | null;
  changeFailureRatePercent: number | null;
  mttrHours: number | null;
}>;

export type ActorKind = "human" | "bot";

export type AuthorActivity = Readonly<{
  login: string;
  prCount: number;
  kind: ActorKind;
}>;

export type ReviewerActivity = Readonly<{
  login: string;
  reviewCount: number;
  kind: ActorKind;
}>;

export type ReviewerPair = Readonly<{
  author: string;
  reviewer: string;
  count: number;
}>;

export type ReviewCorrelation = Readonly<{
  authors: readonly AuthorActivity[];
  reviewers: readonly ReviewerActivity[];
  pairs: readonly ReviewerPair[];
}>;

// --- Timeline types ---

export type TimelineState =
  | "implementing"
  | "wait_review"
  | "fixing"
  | "wait_merge";

export type TimelineSegment = Readonly<{
  state: TimelineState;
  startAt: string;
  endAt: string;
  durationHours: number;
}>;

export type TimelineClosingState = "merged" | "closed_unmerged" | "open";

export type TimelineAuxiliary = Readonly<{
  firstCommitAt: string | null;
  readyForReviewAt: string | null;
  firstReaction: Readonly<{ at: string; by: string }> | null;
  firstApproveAt: string | null;
  approveCount: number;
  dismissCount: number;
  reviewCommentCount: number;
  postApproveCommitCount: number;
  closingState: TimelineClosingState;
  mergedAt: string | null;
  closedAt: string | null;
}>;

export type PrTimeline = Readonly<{
  repo: RepositoryConfig;
  number: number;
  title: string;
  author: string | null;
  totalDurationHours: number;
  segments: readonly TimelineSegment[];
  auxiliary: TimelineAuxiliary;
}>;
