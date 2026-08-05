import type { Meta, StoryObj } from "@storybook/react-vite";

import type { LeadTrendBucket } from "../../analyses/cycle-time/view-model.js";
import LeadTrendChart from "./LeadTrendChart.js";

const meta = {
  title: "Explore/Flow/LeadTrendChart",
  component: LeadTrendChart,
} satisfies Meta<typeof LeadTrendChart>;

export default meta;
type Story = StoryObj<typeof meta>;

function bucket(
  iso: string,
  values: readonly [number | null, number | null, number | null, number | null],
  n: readonly [number, number, number, number],
): LeadTrendBucket {
  return {
    bucket: iso,
    stages: values.map((p50Hours, i) => ({ p50Hours, n: n[i]! })),
  };
}

const denseWeekly: readonly LeadTrendBucket[] = [
  bucket("2026-05-25T00:00:00Z", [3.1, 5.2, 11.0, 1.2], [12, 12, 11, 12]),
  bucket("2026-06-01T00:00:00Z", [2.6, 6.8, 14.5, 0.9], [15, 15, 14, 15]),
  bucket("2026-06-08T00:00:00Z", [4.0, 4.5, 9.2, 1.5], [9, 9, 8, 9]),
  bucket("2026-06-15T00:00:00Z", [1.9, 7.1, 16.8, 1.0], [17, 17, 16, 17]),
  bucket("2026-06-22T00:00:00Z", [3.4, 5.9, 12.1, 1.3], [11, 11, 10, 11]),
  bucket("2026-06-29T00:00:00Z", [2.2, 8.4, 19.6, 0.8], [20, 20, 19, 20]),
  bucket("2026-07-06T00:00:00Z", [3.8, 4.1, 8.5, 1.6], [6, 6, 6, 6]),
  bucket("2026-07-13T00:00:00Z", [2.9, 6.0, 13.3, 1.1], [14, 14, 13, 14]),
];

export const Typical: Story = {
  args: {
    trend: { grain: "week", buckets: denseWeekly },
  },
};

// Low-volume weeks leave some stages with no qualifying PR: the line for that
// stage breaks across the gap instead of interpolating across it
// (docs/explore-screens.md — each stage keeps its own independent `n`).
const sparseWeekly: readonly LeadTrendBucket[] = [
  bucket("2026-05-25T00:00:00Z", [3.1, 5.2, 11.0, 1.2], [12, 12, 11, 12]),
  bucket("2026-06-01T00:00:00Z", [2.6, 6.8, null, 0.9], [15, 15, 0, 15]),
  bucket("2026-06-08T00:00:00Z", [null, null, null, null], [0, 0, 0, 0]),
  bucket("2026-06-15T00:00:00Z", [1.9, 7.1, 16.8, 1.0], [17, 17, 16, 17]),
  bucket("2026-06-22T00:00:00Z", [3.4, null, 12.1, 1.3], [11, 0, 10, 11]),
  bucket("2026-06-29T00:00:00Z", [2.2, 8.4, 19.6, 0.8], [20, 20, 19, 20]),
];

export const SparseBuckets: Story = {
  args: {
    trend: { grain: "week", buckets: sparseWeekly },
  },
};

// No merged PRs in the selected period at all.
export const Empty: Story = {
  args: {
    trend: { grain: "week", buckets: [] },
  },
};

export const Daily: Story = {
  args: {
    trend: {
      grain: "day",
      buckets: [
        bucket("2026-07-13T00:00:00Z", [2.1, 4.0, 9.5, 0.6], [4, 4, 4, 4]),
        bucket("2026-07-14T00:00:00Z", [3.5, 5.1, 12.2, 1.1], [3, 3, 3, 3]),
        bucket("2026-07-15T00:00:00Z", [1.8, 3.9, 7.8, 0.5], [5, 5, 5, 5]),
        bucket("2026-07-16T00:00:00Z", [2.9, 6.2, 14.0, 1.4], [2, 2, 2, 2]),
        bucket("2026-07-17T00:00:00Z", [2.4, 4.8, 10.6, 0.8], [6, 6, 6, 6]),
      ],
    },
  },
};
