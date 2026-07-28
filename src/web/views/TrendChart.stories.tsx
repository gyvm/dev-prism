import type { Meta, StoryObj } from "@storybook/react-vite";

import type { ActivityTrendBucket } from "../../analyses/activity-trend/view-model.js";
import TrendChart, { TREND_COLORS } from "./TrendChart.js";

// Smoke story proving the Storybook pipeline (Tailwind v4 + daisyUI theme,
// view-model fixtures) before the new Explore screens are designed here.

const weeklyBuckets: readonly ActivityTrendBucket[] = [
  { bucket: "2026-05-25T00:00:00Z", prOpened: 12, prMerged: 9, reviews: 31, comments: 54 },
  { bucket: "2026-06-01T00:00:00Z", prOpened: 15, prMerged: 14, reviews: 40, comments: 62 },
  { bucket: "2026-06-08T00:00:00Z", prOpened: 8, prMerged: 11, reviews: 22, comments: 35 },
  { bucket: "2026-06-15T00:00:00Z", prOpened: 17, prMerged: 13, reviews: 45, comments: 71 },
  { bucket: "2026-06-22T00:00:00Z", prOpened: 11, prMerged: 12, reviews: 28, comments: 49 },
  { bucket: "2026-06-29T00:00:00Z", prOpened: 20, prMerged: 16, reviews: 52, comments: 88 },
  { bucket: "2026-07-06T00:00:00Z", prOpened: 6, prMerged: 8, reviews: 18, comments: 24 },
  { bucket: "2026-07-13T00:00:00Z", prOpened: 14, prMerged: 10, reviews: 36, comments: 58 },
];

const meta = {
  title: "Explore/Flow/TrendChart",
  component: TrendChart,
} satisfies Meta<typeof TrendChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PrCounts: Story = {
  args: {
    title: "PR 件数の推移",
    buckets: weeklyBuckets,
    grain: "week",
    series: [
      { key: "prOpened", label: "作成", color: TREND_COLORS.prOpened },
      { key: "prMerged", label: "マージ", color: TREND_COLORS.prMerged },
    ],
  },
};

export const AllSeries: Story = {
  args: {
    ...PrCounts.args,
    title: "アクティビティの推移",
    series: [
      { key: "prOpened", label: "作成", color: TREND_COLORS.prOpened },
      { key: "prMerged", label: "マージ", color: TREND_COLORS.prMerged },
      { key: "reviews", label: "レビュー", color: TREND_COLORS.reviews },
      { key: "comments", label: "コメント", color: TREND_COLORS.comments },
    ],
  },
};

export const Empty: Story = {
  args: {
    ...PrCounts.args,
    buckets: [],
  },
};
