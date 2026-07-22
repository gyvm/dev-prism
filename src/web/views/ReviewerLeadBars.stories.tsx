import type { Meta, StoryObj } from "@storybook/react-vite";

import type { ReviewerLead, ReviewerLeadTimes } from "../../analyses/review-metrics/view-model.js";
import ReviewerLeadBars from "./ReviewerLeadBars.js";

const meta = {
  title: "Explore/Review/ReviewerLeadBars",
  component: ReviewerLeadBars,
} satisfies Meta<typeof ReviewerLeadBars>;

export default meta;
type Story = StoryObj<typeof meta>;

// Deliberately not sorted by p50Hours — the component renders prop order
// as-is (no ranking), so the fixture order should look arbitrary, not tidy.
const mixedReviewers: readonly ReviewerLead[] = [
  { reviewer: "hoshino", p50Hours: 2.5, respondedCount: 14, pendingCount: 0 },
  { reviewer: "kaede", p50Hours: 18, respondedCount: 9, pendingCount: 2 },
  { reviewer: "reviewer-bot", p50Hours: 0.3, respondedCount: 40, pendingCount: 0 },
  { reviewer: "tsukishima", p50Hours: null, respondedCount: 0, pendingCount: 3 },
  { reviewer: "amamiya", p50Hours: 6.5, respondedCount: 11, pendingCount: 1 },
  { reviewer: "nagi", p50Hours: 40, respondedCount: 3, pendingCount: 0 },
];

const typical: ReviewerLeadTimes = { reviewers: mixedReviewers };

export const MixedResponses: Story = {
  args: { data: typical },
};

export const AllResponded: Story = {
  args: {
    data: {
      reviewers: [
        { reviewer: "hoshino", p50Hours: 2.5, respondedCount: 14, pendingCount: 0 },
        { reviewer: "kaede", p50Hours: 8, respondedCount: 9, pendingCount: 0 },
        { reviewer: "amamiya", p50Hours: 20, respondedCount: 5, pendingCount: 0 },
      ],
    },
  },
};

export const AllPending: Story = {
  args: {
    data: {
      reviewers: [
        { reviewer: "new-reviewer", p50Hours: null, respondedCount: 0, pendingCount: 4 },
      ],
    },
  },
};

export const Empty: Story = {
  args: { data: { reviewers: [] } },
};
