import type { Meta, StoryObj } from "@storybook/react-vite";

import type { AgingHistogram as AgingHistogramData } from "../../analyses/aging/view-model.js";
import AgingHistogram from "./AgingHistogram.js";

const meta = {
  title: "Explore/Wip/AgingHistogram",
  component: AgingHistogram,
} satisfies Meta<typeof AgingHistogram>;

export default meta;
type Story = StoryObj<typeof meta>;

// Chronic backlog: most open PRs sit in the oldest bucket.
export const RightHeavy: Story = {
  args: {
    histogram: {
      buckets: [
        { bucket: "<1d", count: 1 },
        { bucket: "1-3d", count: 2 },
        { bucket: "3-7d", count: 3 },
        { bucket: "7-14d", count: 5 },
        { bucket: "14d+", count: 11 },
      ],
    } satisfies AgingHistogramData,
  },
};

// Healthy backlog: aging is transient, concentrated in the newest bucket.
export const RecentConcentration: Story = {
  args: {
    histogram: {
      buckets: [
        { bucket: "<1d", count: 9 },
        { bucket: "1-3d", count: 4 },
        { bucket: "3-7d", count: 1 },
        { bucket: "7-14d", count: 0 },
        { bucket: "14d+", count: 0 },
      ],
    } satisfies AgingHistogramData,
  },
};

export const Empty: Story = {
  args: {
    histogram: {
      buckets: [
        { bucket: "<1d", count: 0 },
        { bucket: "1-3d", count: 0 },
        { bucket: "3-7d", count: 0 },
        { bucket: "7-14d", count: 0 },
        { bucket: "14d+", count: 0 },
      ],
    } satisfies AgingHistogramData,
  },
};
