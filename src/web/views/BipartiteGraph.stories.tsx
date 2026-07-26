import type { Meta, StoryObj } from "@storybook/react-vite";

import type { ReviewCorrelation } from "../../shared/types.js";
import BipartiteGraph from "./BipartiteGraph.js";

const meta = {
  title: "Explore/Review/BipartiteGraph",
  component: BipartiteGraph,
} satisfies Meta<typeof BipartiteGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

const reviewCorrelation: ReviewCorrelation = {
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
};

export const Typical: Story = {
  args: { data: reviewCorrelation },
};

export const Empty: Story = {
  args: { data: { authors: [], reviewers: [], pairs: [] } },
};
