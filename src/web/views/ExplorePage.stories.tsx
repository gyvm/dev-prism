import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import type {
  AgingHistogram as AgingHistogramData,
  AgingPr,
  AgingSummary,
  AgingTable as AgingTableData,
} from "../../analyses/aging/view-model.js";
import type {
  CycleFunnel as CycleFunnelData,
  LeadTrend,
  PrStageTimes,
} from "../../analyses/cycle-time/view-model.js";
import type { DoraComparison } from "../../analyses/dora-metrics/view-model.js";
import type { PrTimelineOutput } from "../../analyses/pr-timeline/compute.js";
import type {
  ReviewerLeadTimes,
  ReviewlessMerges,
  SizePickupScatter as SizePickupScatterData,
} from "../../analyses/review-metrics/view-model.js";
import type { Grain } from "../../analyses/scope.js";
import type { ReviewCorrelation } from "../../shared/types.js";
import ExploreFilters, { type ExploreFilterValue } from "../islands/ExploreFilters.js";
import AgingHistogram from "./AgingHistogram.js";
import AgingSummaryCards from "./AgingSummaryCards.js";
import AgingTable from "./AgingTable.js";
import BipartiteGraph from "./BipartiteGraph.js";
import CycleFunnel from "./CycleFunnel.js";
import DoraComparisonCards from "./DoraComparisonCards.js";
import GanttChart from "./GanttChart.js";
import LeadTrendChart from "./LeadTrendChart.js";
import ReviewerLeadBars from "./ReviewerLeadBars.js";
import ReviewlessMergeCard from "./ReviewlessMergeCard.js";
import SizePickupScatter from "./SizePickupScatter.js";
import StageTimeTable from "./StageTimeTable.js";
import TrendChart, { TREND_COLORS } from "./TrendChart.js";

const trendBuckets = [
  { bucket: "2026-05-25T00:00:00Z", prOpened: 12, prMerged: 9, reviews: 31, comments: 54 },
  { bucket: "2026-06-01T00:00:00Z", prOpened: 15, prMerged: 14, reviews: 40, comments: 62 },
  { bucket: "2026-06-08T00:00:00Z", prOpened: 8, prMerged: 11, reviews: 22, comments: 35 },
  { bucket: "2026-06-15T00:00:00Z", prOpened: 17, prMerged: 13, reviews: 45, comments: 71 },
  { bucket: "2026-06-22T00:00:00Z", prOpened: 11, prMerged: 12, reviews: 28, comments: 49 },
  { bucket: "2026-06-29T00:00:00Z", prOpened: 20, prMerged: 16, reviews: 52, comments: 88 },
  { bucket: "2026-07-06T00:00:00Z", prOpened: 6, prMerged: 8, reviews: 18, comments: 24 },
  { bucket: "2026-07-13T00:00:00Z", prOpened: 14, prMerged: 10, reviews: 36, comments: 58 },
] as const;

function formatPeriod(from: Date | null, to: Date | null): string {
  const format = (date: Date | null) => date?.toISOString().slice(0, 10) ?? "—";
  return `${format(from)} 〜 ${format(to)}`;
}

// ── Flow (1-x) ──────────────────────────────────────────────────────────────

const dora = {
  current: {
    deploymentFrequency: 16,
    leadTimeForChangesHours: 21.4,
    changeFailureRatePercent: 6.3,
    mttrHours: 4.8,
  },
  previous: {
    deploymentFrequency: 12,
    leadTimeForChangesHours: 26.1,
    changeFailureRatePercent: 6.3,
    mttrHours: 7.0,
  },
  delta: {
    deploymentFrequency: 4,
    leadTimeForChangesHours: -4.7,
    changeFailureRatePercent: 0,
    mttrHours: -2.2,
  },
} satisfies DoraComparison;

const cycleFunnel = {
  stages: [
    { stage: 1, key: "commit_to_open", p50Hours: 3.2, n: 24 },
    { stage: 2, key: "open_to_review", p50Hours: 5.8, n: 24 },
    { stage: 3, key: "review_to_approve", p50Hours: 12.4, n: 22 },
    { stage: 4, key: "approve_to_merge", p50Hours: 1.1, n: 22 },
  ],
} satisfies CycleFunnelData;

function leadBucket(
  iso: string,
  values: readonly [number, number, number, number],
  n: readonly [number, number, number, number],
) {
  return { bucket: iso, stages: values.map((p50Hours, i) => ({ p50Hours, n: n[i]! })) };
}

const leadTrend = {
  grain: "week",
  buckets: [
    leadBucket("2026-05-25T00:00:00Z", [3.1, 5.2, 11.0, 1.2], [12, 12, 11, 12]),
    leadBucket("2026-06-01T00:00:00Z", [2.6, 6.8, 14.5, 0.9], [15, 15, 14, 15]),
    leadBucket("2026-06-08T00:00:00Z", [4.0, 4.5, 9.2, 1.5], [9, 9, 8, 9]),
    leadBucket("2026-06-15T00:00:00Z", [1.9, 7.1, 16.8, 1.0], [17, 17, 16, 17]),
    leadBucket("2026-06-22T00:00:00Z", [3.4, 5.9, 12.1, 1.3], [11, 11, 10, 11]),
    leadBucket("2026-06-29T00:00:00Z", [2.2, 8.4, 18.2, 0.7], [20, 20, 19, 20]),
    leadBucket("2026-07-06T00:00:00Z", [5.1, 3.8, 7.4, 2.1], [6, 6, 6, 6]),
    leadBucket("2026-07-13T00:00:00Z", [3.0, 6.2, 13.3, 1.1], [14, 14, 13, 14]),
  ],
} satisfies LeadTrend;

// ── Review (2-x) ────────────────────────────────────────────────────────────

const reviewless = { mergedCount: 42, reviewlessCount: 6, rate: 6 / 42 } satisfies ReviewlessMerges;

const scatterPoints = [
  { number: 101, title: "Fix typo in README", url: "https://github.com/gyvm/dev-prism/pull/101", repoKey: "gyvm/dev-prism", pickupHours: 0.5, sizeLines: 10 },
  { number: 102, title: "Bump lockfile", url: "https://github.com/gyvm/dev-prism/pull/102", repoKey: "gyvm/dev-prism", pickupHours: 1.2, sizeLines: 25 },
  { number: 103, title: "Add unit tests for scope filter", url: "https://github.com/gyvm/dev-prism/pull/103", repoKey: "gyvm/dev-prism", pickupHours: 3.5, sizeLines: 140 },
  { number: 55, title: "Refactor warehouse runner", url: "https://github.com/gyvm/other-repo/pull/55", repoKey: "gyvm/other-repo", pickupHours: 6, sizeLines: 320 },
  { number: 104, title: "Introduce aging query builder", url: "https://github.com/gyvm/dev-prism/pull/104", repoKey: "gyvm/dev-prism", pickupHours: 9, sizeLines: 480 },
  { number: 106, title: "Rework Explore filter bar", url: "https://github.com/gyvm/dev-prism/pull/106", repoKey: "gyvm/dev-prism", pickupHours: 30, sizeLines: 1500 },
  { number: 107, title: "Large data migration for pr_review_requests", url: "https://github.com/gyvm/dev-prism/pull/107", repoKey: "gyvm/dev-prism", pickupHours: 55, sizeLines: 2800 },
  { number: 57, title: "Vendor upgrade + regenerate of generated clients", url: "https://github.com/gyvm/other-repo/pull/57", repoKey: "gyvm/other-repo", pickupHours: 100, sizeLines: 5000 },
];

const scatter = {
  points: scatterPoints,
  totalMatched: scatterPoints.length,
  truncated: false,
} satisfies SizePickupScatterData;

const reviewCorrelation = {
  authors: [
    { login: "hoshino", prCount: 14, kind: "human" },
    { login: "kaede", prCount: 10, kind: "human" },
    { login: "automation-bot", prCount: 8, kind: "bot" },
  ],
  reviewers: [
    { login: "amamiya", reviewCount: 16, kind: "human" },
    { login: "nagi", reviewCount: 12, kind: "human" },
    { login: "reviewer-bot", reviewCount: 9, kind: "bot" },
  ],
  pairs: [
    { author: "hoshino", reviewer: "amamiya", count: 8 },
    { author: "hoshino", reviewer: "nagi", count: 4 },
    { author: "kaede", reviewer: "amamiya", count: 5 },
    { author: "kaede", reviewer: "reviewer-bot", count: 4 },
    { author: "automation-bot", reviewer: "reviewer-bot", count: 5 },
  ],
} satisfies ReviewCorrelation;

const reviewerLead = {
  reviewers: [
    { reviewer: "hoshino", p50Hours: 2.5, respondedCount: 14, pendingCount: 0 },
    { reviewer: "kaede", p50Hours: 18, respondedCount: 9, pendingCount: 2 },
    { reviewer: "reviewer-bot", p50Hours: 0.3, respondedCount: 40, pendingCount: 0 },
    { reviewer: "tsukishima", p50Hours: null, respondedCount: 0, pendingCount: 3 },
    { reviewer: "amamiya", p50Hours: 6.5, respondedCount: 11, pendingCount: 1 },
    { reviewer: "nagi", p50Hours: 40, respondedCount: 3, pendingCount: 0 },
  ],
} satisfies ReviewerLeadTimes;

// ── Timeline (3-x) ──────────────────────────────────────────────────────────

const timeline = {
  weekStart: "2026-07-13T00:00:00.000Z",
  weekEnd: "2026-07-20T00:00:00.000Z",
  timezone: "Asia/Tokyo",
  timelines: [
    {
      repo: { owner: "gyvm", name: "dev-prism" },
      number: 512,
      title: "Add page-level Explore stories",
      author: "hoshino",
      totalDurationHours: 45,
      segments: [
        { state: "implementing", startAt: "2026-07-14T01:00:00.000Z", endAt: "2026-07-15T02:00:00.000Z", durationHours: 25 },
        { state: "wait_review", startAt: "2026-07-15T02:00:00.000Z", endAt: "2026-07-15T16:00:00.000Z", durationHours: 14 },
        { state: "wait_merge", startAt: "2026-07-15T16:00:00.000Z", endAt: "2026-07-15T22:00:00.000Z", durationHours: 6 },
      ],
      auxiliary: {
        firstCommitAt: "2026-07-14T01:00:00.000Z",
        readyForReviewAt: "2026-07-15T02:00:00.000Z",
        firstReaction: { at: "2026-07-15T04:30:00.000Z", by: "amamiya" },
        firstApproveAt: "2026-07-15T14:30:00.000Z",
        approveCount: 1,
        dismissCount: 0,
        reviewCommentCount: 3,
        postApproveCommitCount: 0,
        closingState: "merged",
        mergedAt: "2026-07-15T22:00:00.000Z",
        closedAt: "2026-07-15T22:00:00.000Z",
      },
    },
    {
      repo: { owner: "gyvm", name: "other-repo" },
      number: 107,
      title: "Rework the collection window",
      author: "kaede",
      totalDurationHours: 71,
      segments: [
        { state: "implementing", startAt: "2026-07-14T06:00:00.000Z", endAt: "2026-07-15T18:00:00.000Z", durationHours: 36 },
        { state: "wait_review", startAt: "2026-07-15T18:00:00.000Z", endAt: "2026-07-16T20:00:00.000Z", durationHours: 26 },
        { state: "fixing", startAt: "2026-07-16T20:00:00.000Z", endAt: "2026-07-17T05:00:00.000Z", durationHours: 9 },
      ],
      auxiliary: {
        firstCommitAt: "2026-07-14T06:00:00.000Z",
        readyForReviewAt: "2026-07-15T18:00:00.000Z",
        firstReaction: { at: "2026-07-16T02:10:00.000Z", by: "nagi" },
        firstApproveAt: null,
        approveCount: 0,
        dismissCount: 0,
        reviewCommentCount: 6,
        postApproveCommitCount: 1,
        closingState: "open",
        mergedAt: null,
        closedAt: null,
      },
    },
    {
      repo: { owner: "gyvm", name: "dev-prism" },
      number: 509,
      title: "Remove obsolete dashboard entry point",
      author: "hoshino",
      totalDurationHours: 29,
      segments: [
        { state: "implementing", startAt: "2026-07-16T03:00:00.000Z", endAt: "2026-07-16T14:00:00.000Z", durationHours: 11 },
        { state: "wait_review", startAt: "2026-07-16T14:00:00.000Z", endAt: "2026-07-17T08:00:00.000Z", durationHours: 18 },
      ],
      auxiliary: {
        firstCommitAt: "2026-07-16T03:00:00.000Z",
        readyForReviewAt: "2026-07-16T14:00:00.000Z",
        firstReaction: { at: "2026-07-16T19:00:00.000Z", by: "reviewer-bot" },
        firstApproveAt: null,
        approveCount: 0,
        dismissCount: 0,
        reviewCommentCount: 1,
        postApproveCommitCount: 0,
        closingState: "closed_unmerged",
        mergedAt: null,
        closedAt: "2026-07-17T08:00:00.000Z",
      },
    },
  ],
} satisfies PrTimelineOutput;

const stageTimes: readonly PrStageTimes[] = [
  { number: 512, title: "Add page-level Explore stories", url: "https://github.com/gyvm/dev-prism/pull/512", repoKey: "gyvm/dev-prism", sizeLines: 84, stageHours: [2.1, 5.4, 1.2, 0.8], mergedAt: "2026-07-15T22:00:00Z" },
  { number: 498, title: "Rework aging status derivation", url: "https://github.com/gyvm/dev-prism/pull/498", repoKey: "gyvm/dev-prism", sizeLines: 412, stageHours: [18.6, 40.2, 6.5, 3.2], mergedAt: "2026-07-12T15:05:00Z" },
  { number: 493, title: "Fix flaky DuckDB-WASM parquet load in CI", url: "https://github.com/gyvm/dev-prism/pull/493", repoKey: "gyvm/dev-prism", sizeLines: 26, stageHours: [0.4, 1.1, null, 0.3], mergedAt: "2026-07-11T08:20:00Z" },
  { number: 60, title: "Large migration: split warehouse schema", url: "https://github.com/gyvm/other-repo/pull/60", repoKey: "gyvm/other-repo", sizeLines: 2140, stageHours: [64.0, 92.5, 30.1, 8.4], mergedAt: "2026-07-09T11:00:00Z" },
];

// ── Wip (4-x) ───────────────────────────────────────────────────────────────

const agingSummary = {
  openCount: 14,
  awaitingReviewCount: 6,
  oldestAgeDays: 21.7,
} satisfies AgingSummary;

const agingPrs: readonly AgingPr[] = [
  { number: 512, title: "Investigate flaky nightly build", url: "https://github.com/gyvm/dev-prism/pull/512", repoKey: "gyvm/dev-prism", author: "hoshino", status: "awaiting_review", ballHolder: "amamiya", ageHours: 520.4, createdAt: "2026-07-01T03:00:00Z", updatedAt: "2026-07-18T09:00:00Z" },
  { number: 507, title: "Draft: exploratory bulk-import rewrite", url: "https://github.com/gyvm/dev-prism/pull/507", repoKey: "gyvm/dev-prism", author: "kaede", status: "draft", ballHolder: "kaede", ageHours: 340.5, createdAt: "2026-07-08T02:00:00Z", updatedAt: "2026-07-20T14:00:00Z" },
  { number: 503, title: "Address review feedback on scope-sql helper", url: "https://github.com/gyvm/dev-prism/pull/503", repoKey: "gyvm/dev-prism", author: "nagi", status: "changes_requested", ballHolder: "nagi", ageHours: 96.2, createdAt: "2026-07-18T10:00:00Z", updatedAt: "2026-07-21T18:30:00Z" },
  { number: 499, title: "Approved, waiting for a maintainer to merge", url: "https://github.com/gyvm/other-repo/pull/499", repoKey: "gyvm/other-repo", author: "amamiya", status: "approved", ballHolder: "amamiya", ageHours: 40.0, createdAt: "2026-07-20T08:00:00Z", updatedAt: "2026-07-22T02:00:00Z" },
  { number: 495, title: "Small fix, no reviewer assigned yet", url: "https://github.com/gyvm/dev-prism/pull/495", repoKey: "gyvm/dev-prism", author: null, status: "awaiting_review", ballHolder: null, ageHours: 2.3, createdAt: "2026-07-22T21:00:00Z", updatedAt: "2026-07-22T21:40:00Z" },
];

const agingTable = { prs: agingPrs } satisfies AgingTableData;

const agingHistogram = {
  buckets: [
    { bucket: "<1d", count: 2 },
    { bucket: "1-3d", count: 3 },
    { bucket: "3-7d", count: 4 },
    { bucket: "7-14d", count: 3 },
    { bucket: "14d+", count: 2 },
  ],
} satisfies AgingHistogramData;

// ── Page shell ──────────────────────────────────────────────────────────────

type PageView = "flow" | "review" | "timeline" | "wip";

const TABS: readonly { id: PageView; label: string }[] = [
  { id: "flow", label: "フロー" },
  { id: "review", label: "レビュー" },
  { id: "timeline", label: "タイムライン" },
  { id: "wip", label: "滞留" },
];

/**
 * A fixture-backed composition of the actual Explore routes. DuckDB-WASM stays
 * out of Storybook, while the page chrome and interactive filter controls use
 * the exact components and classes from Explore.
 */
function ExplorePage({
  view,
  children,
}: {
  view: PageView;
  children: (grain: Grain) => ReactNode;
}) {
  const [filters, setFilters] = useState<ExploreFilterValue>({
    from: new Date("2026-05-25T00:00:00Z"),
    to: new Date("2026-07-19T00:00:00Z"),
    grain: "week",
    repos: ["gyvm/dev-prism"],
    users: [],
    includeBots: false,
  });
  const [status, setStatus] = useState(`集計完了 (${formatPeriod(filters.from, filters.to)})`);

  const applyFilters = (next: ExploreFilterValue) => {
    setFilters(next);
    setStatus(`集計完了 (${formatPeriod(next.from, next.to)})`);
  };

  return (
    <main className="explore-main">
      <header>
        <h1>Explore</h1>
        <ExploreFilters
          value={filters}
          options={{
            repos: ["gyvm/dev-prism", "gyvm/other-repo"],
            users: ["hoshino", "kaede", "amamiya", "reviewer-bot"],
          }}
          onChange={setFilters}
          onPreset={applyFilters}
          onSubmit={() => applyFilters(filters)}
          // Same expression Explore.tsx uses, so the disabled state previews for real.
          timeControlsDisabled={view === "wip"}
        />
        <p className="explore-status" role="status" aria-live="polite">
          {status}
        </p>
      </header>
      <nav className="explore-tabs" aria-label="ビュー">
        {TABS.map((tab) => (
          <a
            key={tab.id}
            className={view === tab.id ? "explore-tab is-active" : "explore-tab"}
            href={`#${tab.id}`}
            aria-current={view === tab.id ? "page" : undefined}
            onClick={(event) => event.preventDefault()}
          >
            {tab.label}
          </a>
        ))}
      </nav>
      {children(filters.grain)}
    </main>
  );
}

function ExploreFlowPage() {
  return (
    <ExplorePage view="flow">
      {(grain) => (
        <>
          <DoraComparisonCards comparison={dora} />
          <CycleFunnel
            funnel={cycleFunnel}
            stageHref={(key) => `/explore/timeline/?sort=${key}&dir=desc`}
          />
          <LeadTrendChart trend={leadTrend} />
          <TrendChart
            title="PR 件数の推移"
            buckets={trendBuckets}
            grain={grain}
            series={[
              { key: "prOpened", label: "作成", color: TREND_COLORS.prOpened },
              { key: "prMerged", label: "マージ", color: TREND_COLORS.prMerged },
            ]}
          />
        </>
      )}
    </ExplorePage>
  );
}

function ExploreReviewPage() {
  return (
    <ExplorePage view="review">
      {(grain) => (
        <>
          <ReviewlessMergeCard data={reviewless} />
          <TrendChart
            title="レビュー・コメント件数の推移"
            buckets={trendBuckets}
            grain={grain}
            series={[
              { key: "reviews", label: "レビュー", color: TREND_COLORS.reviews },
              { key: "comments", label: "コメント", color: TREND_COLORS.comments },
            ]}
          />
          <SizePickupScatter scatter={scatter} />
          <BipartiteGraph data={reviewCorrelation} />
          <ReviewerLeadBars data={reviewerLead} />
        </>
      )}
    </ExplorePage>
  );
}

function ExploreTimelinePage() {
  return (
    <ExplorePage view="timeline">
      {() => (
        <>
          <GanttChart {...timeline} />
          {/* As the flow funnel's drilldown lands it: sorted by open→review, longest first. */}
          <StageTimeTable rows={stageTimes} initialSort={{ key: "open_to_review", desc: true }} />
        </>
      )}
    </ExplorePage>
  );
}

function ExploreWipPage() {
  return (
    <ExplorePage view="wip">
      {() => (
        <>
          <AgingSummaryCards summary={agingSummary} />
          <AgingTable table={agingTable} />
          <AgingHistogram histogram={agingHistogram} />
        </>
      )}
    </ExplorePage>
  );
}

const meta = {
  title: "Explore/Page",
  component: ExploreFlowPage,
  parameters: {
    layout: "fullscreen",
    explorePage: true,
  },
} satisfies Meta<typeof ExploreFlowPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Flow: Story = {};
export const Review: Story = { render: () => <ExploreReviewPage /> };
export const Timeline: Story = { render: () => <ExploreTimelinePage /> };
export const Wip: Story = { render: () => <ExploreWipPage /> };
