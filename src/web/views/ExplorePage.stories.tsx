import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import type { PrTimelineOutput } from "../../analyses/pr-timeline/compute.js";
import type { Grain } from "../../analyses/scope.js";
import { MetricCards } from "../../renderers/metric-cards.js";
import type { ReviewCorrelation } from "../../shared/types.js";
import ExploreFilters, { type ExploreFilterValue } from "../islands/ExploreFilters.js";
import BipartiteGraph from "./BipartiteGraph.js";
import GanttChart from "./GanttChart.js";
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

/**
 * A fixture-backed composition of the actual Flow route. DuckDB-WASM stays
 * out of Storybook, while the page chrome and interactive filter controls use
 * the exact components and classes from Explore.
 */
function ExplorePage({
  view,
  children,
}: {
  view: "flow" | "review" | "timeline";
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
        />
        <p className="explore-status" role="status" aria-live="polite">
          {status}
        </p>
      </header>
      <nav className="explore-tabs" aria-label="ビュー">
        <a
          className={view === "flow" ? "explore-tab is-active" : "explore-tab"}
          href="#flow"
          aria-current={view === "flow" ? "page" : undefined}
          onClick={(event) => event.preventDefault()}
        >
          フロー
        </a>
        <a
          className={view === "review" ? "explore-tab is-active" : "explore-tab"}
          href="#review"
          aria-current={view === "review" ? "page" : undefined}
          onClick={(event) => event.preventDefault()}
        >
          レビュー
        </a>
        <a
          className={view === "timeline" ? "explore-tab is-active" : "explore-tab"}
          href="#timeline"
          aria-current={view === "timeline" ? "page" : undefined}
          onClick={(event) => event.preventDefault()}
        >
          PR個別
        </a>
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
          <MetricCards
            dora={{
              deploymentFrequency: 16,
              leadTimeForChangesHours: 21.4,
              changeFailureRatePercent: 6.3,
              mttrHours: 4.8,
            }}
          />
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
          <TrendChart
            title="レビュー・コメント件数の推移"
            buckets={trendBuckets}
            grain={grain}
            series={[
              { key: "reviews", label: "レビュー", color: TREND_COLORS.reviews },
              { key: "comments", label: "コメント", color: TREND_COLORS.comments },
            ]}
          />
          <BipartiteGraph data={reviewCorrelation} />
        </>
      )}
    </ExplorePage>
  );
}

function ExploreTimelinePage() {
  return (
    <ExplorePage view="timeline">
      {() => <GanttChart {...timeline} />}
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
