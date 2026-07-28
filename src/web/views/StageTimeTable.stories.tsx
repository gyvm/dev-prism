import type { Meta, StoryObj } from "@storybook/react-vite";

import type { PrStageTimes } from "../../analyses/cycle-time/view-model.js";
import StageTimeTable from "./StageTimeTable.js";

const rows: readonly PrStageTimes[] = [
  {
    number: 501,
    title: "Add retry to webhook delivery",
    url: "https://github.com/gyvm/dev-prism/pull/501",
    repoKey: "gyvm/dev-prism",
    sizeLines: 84,
    stageHours: [2.1, 5.4, 1.2, 0.8],
    mergedAt: "2026-07-14T09:30:00Z",
  },
  {
    number: 498,
    title: "Rework aging status derivation",
    url: "https://github.com/gyvm/dev-prism/pull/498",
    repoKey: "gyvm/dev-prism",
    sizeLines: 412,
    stageHours: [18.6, 40.2, 6.5, 3.2],
    mergedAt: "2026-07-12T15:05:00Z",
  },
  {
    number: 493,
    title: "Fix flaky DuckDB-WASM parquet load in CI",
    url: "https://github.com/gyvm/dev-prism/pull/493",
    repoKey: "gyvm/dev-prism",
    sizeLines: 26,
    stageHours: [0.4, 1.1, 0.3, 0.2],
    mergedAt: "2026-07-11T11:40:00Z",
  },
  {
    number: 487,
    title: "Explore filter bar: bot toggle",
    url: "https://github.com/gyvm/dev-prism/pull/487",
    repoKey: "gyvm/dev-prism",
    sizeLines: 156,
    stageHours: [4.8, 22.9, 12.4, 1.6],
    mergedAt: "2026-07-09T08:15:00Z",
  },
  {
    number: 480,
    title: "Bipartite graph hover via React handlers",
    url: "https://github.com/gyvm/dev-prism/pull/480",
    repoKey: "gyvm/other-repo",
    sizeLines: 63,
    stageHours: [1.0, 3.3, 0.9, 0.4],
    mergedAt: "2026-07-08T19:50:00Z",
  },
  {
    number: 476,
    title: "Large migration: split warehouse schema",
    url: "https://github.com/gyvm/other-repo/pull/476",
    repoKey: "gyvm/other-repo",
    sizeLines: 1840,
    stageHours: [72.0, 130.5, 48.2, 20.1],
    mergedAt: "2026-07-05T13:00:00Z",
  },
];

// Squash-merged PRs (no pr_commits rows) leave stage 1 null; a PR merged
// straight from approval with no separate review step leaves stage 3 null.
const rowsWithNulls: readonly PrStageTimes[] = [
  {
    number: 470,
    title: "Squash-merge docs typo fix",
    url: "https://github.com/gyvm/dev-prism/pull/470",
    repoKey: "gyvm/dev-prism",
    sizeLines: 4,
    stageHours: [null, 0.6, 0.2, 0.1],
    mergedAt: "2026-07-03T10:00:00Z",
  },
  {
    number: 468,
    title: "PR with no title",
    url: null,
    repoKey: "gyvm/dev-prism",
    sizeLines: 210,
    stageHours: [12.0, 8.4, null, 2.0],
    mergedAt: "2026-07-02T22:10:00Z",
  },
  {
    number: 465,
    title: "Draft-only PR, all stages missing but merge",
    url: "https://github.com/gyvm/dev-prism/pull/465",
    repoKey: "gyvm/dev-prism",
    sizeLines: 9,
    stageHours: [null, null, null, null],
    mergedAt: "2026-07-01T06:45:00Z",
  },
];

const meta = {
  title: "Explore/Timeline/StageTimeTable",
  component: StageTimeTable,
} satisfies Meta<typeof StageTimeTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { rows },
};

export const Empty: Story = {
  args: { rows: [] },
};

export const WithNulls: Story = {
  args: { rows: rowsWithNulls },
};

// Lands as if the user clicked the 1-2 funnel's "open→review" stage card,
// which opens 3-2 sorted by that stage's hours, descending.
export const InitialSortFromFunnelDrilldown: Story = {
  args: {
    rows,
    initialSort: { key: "open_to_review", desc: true },
  },
};
