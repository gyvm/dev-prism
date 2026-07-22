import type { Meta, StoryObj } from "@storybook/react-vite";

import type {
  SizePickupPoint,
  SizePickupScatter as SizePickupScatterData,
} from "../../analyses/review-metrics/view-model.js";
import SizePickupScatter from "./SizePickupScatter.js";

// Spans two-plus orders of magnitude on both axes on purpose, per the task
// brief (pickupHours 0.5–100h, sizeLines 10–5000) — small enough that the log
// y-axis actually does something, not so uniform that it looks staged.
const typicalPoints: readonly SizePickupPoint[] = [
  { number: 101, title: "Fix typo in README", url: "https://github.com/gyvm/dev-prism/pull/101", repoKey: "gyvm/dev-prism", pickupHours: 0.5, sizeLines: 10 },
  { number: 102, title: "Bump lockfile", url: "https://github.com/gyvm/dev-prism/pull/102", repoKey: "gyvm/dev-prism", pickupHours: 1.2, sizeLines: 25 },
  { number: 103, title: "Add unit tests for scope filter", url: "https://github.com/gyvm/dev-prism/pull/103", repoKey: "gyvm/dev-prism", pickupHours: 3.5, sizeLines: 140 },
  { number: 55, title: "Refactor warehouse runner", url: "https://github.com/gyvm/other-repo/pull/55", repoKey: "gyvm/other-repo", pickupHours: 6, sizeLines: 320 },
  { number: 104, title: "Introduce aging query builder", url: "https://github.com/gyvm/dev-prism/pull/104", repoKey: "gyvm/dev-prism", pickupHours: 9, sizeLines: 480 },
  { number: 105, title: "Wire up review metrics view-model", url: null, repoKey: "gyvm/dev-prism", pickupHours: 14, sizeLines: 610 },
  { number: 56, title: "Add BYOC carrier config", url: "https://github.com/gyvm/other-repo/pull/56", repoKey: "gyvm/other-repo", pickupHours: 22, sizeLines: 900 },
  { number: 106, title: "Rework Explore filter bar", url: "https://github.com/gyvm/dev-prism/pull/106", repoKey: "gyvm/dev-prism", pickupHours: 30, sizeLines: 1500 },
  { number: 107, title: "Large data migration for pr_review_requests", url: "https://github.com/gyvm/dev-prism/pull/107", repoKey: "gyvm/dev-prism", pickupHours: 55, sizeLines: 2800 },
  { number: 57, title: "Vendor upgrade + full re-generate of generated clients", url: "https://github.com/gyvm/other-repo/pull/57", repoKey: "gyvm/other-repo", pickupHours: 100, sizeLines: 5000 },
];

const typical: SizePickupScatterData = {
  points: typicalPoints,
  totalMatched: typicalPoints.length,
  truncated: false,
};

const meta = {
  title: "Explore/Review/SizePickupScatter",
  component: SizePickupScatter,
} satisfies Meta<typeof SizePickupScatter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Typical: Story = {
  args: { scatter: typical },
};

export const Truncated: Story = {
  args: {
    scatter: {
      points: typicalPoints,
      totalMatched: 2143,
      truncated: true,
    },
  },
};

export const Empty: Story = {
  args: {
    scatter: { points: [], totalMatched: 0, truncated: false },
  },
};
