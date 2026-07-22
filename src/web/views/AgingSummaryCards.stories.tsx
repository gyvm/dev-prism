import type { Meta, StoryObj } from "@storybook/react-vite";

import type { AgingSummary } from "../../analyses/aging/view-model.js";
import AgingSummaryCards from "./AgingSummaryCards.js";

const meta = {
  title: "Explore/Wip/AgingSummaryCards",
  component: AgingSummaryCards,
} satisfies Meta<typeof AgingSummaryCards>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    summary: {
      openCount: 14,
      awaitingReviewCount: 6,
      oldestAgeDays: 21.7,
    } satisfies AgingSummary,
  },
};

export const NoOpenPrs: Story = {
  args: {
    summary: {
      openCount: 0,
      awaitingReviewCount: 0,
      oldestAgeDays: null,
    } satisfies AgingSummary,
  },
};
