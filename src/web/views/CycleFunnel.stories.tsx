import type { Meta, StoryObj } from "@storybook/react-vite";

import type { CycleFunnel } from "../../analyses/cycle-time/view-model.js";
import CycleFunnelView from "./CycleFunnel.js";

const meta = {
  title: "Explore/Flow/CycleFunnel",
  component: CycleFunnelView,
} satisfies Meta<typeof CycleFunnelView>;

export default meta;
type Story = StoryObj<typeof meta>;

const typical: CycleFunnel = {
  stages: [
    { stage: 1, key: "commit_to_open", p50Hours: 3.2, n: 24 },
    { stage: 2, key: "open_to_review", p50Hours: 5.8, n: 24 },
    { stage: 3, key: "review_to_approve", p50Hours: 12.4, n: 22 },
    { stage: 4, key: "approve_to_merge", p50Hours: 1.1, n: 22 },
  ],
};

// Drilldown wired: each stage card is a link to Timeline 3-2, sorted by that
// stage's hours descending (docs/explore-screens.md ページ間の動線).
export const WithDrilldown: Story = {
  args: {
    funnel: typical,
    stageHref: (key) => `/explore/timeline/?sort=${key}&dir=desc`,
  },
};

// No `stageHref`: cards render as static articles, not links (e.g. the
// consumer hasn't wired the timeline route yet).
export const WithoutDrilldown: Story = {
  args: { funnel: typical },
};

// Squash-merge-only repos never populate `pr_commits`, so `first_commit` LEFT
// JOINs to nothing and only stage 1 goes null — the other three stages keep
// their own independent `n` (docs/explore-screens-sql-design.md 1-2).
export const SparseCommitStage: Story = {
  args: {
    funnel: {
      stages: [
        { stage: 1, key: "commit_to_open", p50Hours: null, n: 0 },
        { stage: 2, key: "open_to_review", p50Hours: 4.6, n: 18 },
        { stage: 3, key: "review_to_approve", p50Hours: 9.0, n: 17 },
        { stage: 4, key: "approve_to_merge", p50Hours: 0.8, n: 18 },
      ],
    },
    stageHref: (key) => `/explore/timeline/?sort=${key}&dir=desc`,
  },
};

// No merged PRs in the selected period: every stage is empty.
export const Empty: Story = {
  args: {
    funnel: {
      stages: [
        { stage: 1, key: "commit_to_open", p50Hours: null, n: 0 },
        { stage: 2, key: "open_to_review", p50Hours: null, n: 0 },
        { stage: 3, key: "review_to_approve", p50Hours: null, n: 0 },
        { stage: 4, key: "approve_to_merge", p50Hours: null, n: 0 },
      ],
    },
  },
};
