import type { Meta, StoryObj } from "@storybook/react-vite";

import type { ReviewlessMerges } from "../../analyses/review-metrics/view-model.js";
import ReviewlessMergeCard from "./ReviewlessMergeCard.js";

const meta = {
  title: "Explore/Review/ReviewlessMergeCard",
  component: ReviewlessMergeCard,
} satisfies Meta<typeof ReviewlessMergeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const typical: ReviewlessMerges = {
  mergedCount: 42,
  reviewlessCount: 6,
  rate: 6 / 42,
};

export const Typical: Story = {
  args: { data: typical },
};

export const HighRate: Story = {
  args: {
    data: { mergedCount: 20, reviewlessCount: 15, rate: 15 / 20 },
  },
};

export const NoReviewlessMerges: Story = {
  args: {
    data: { mergedCount: 30, reviewlessCount: 0, rate: 0 },
  },
};

export const NoMergesInPeriod: Story = {
  args: {
    data: { mergedCount: 0, reviewlessCount: 0, rate: null },
  },
};
