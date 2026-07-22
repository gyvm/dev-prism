import type { Meta, StoryObj } from "@storybook/react-vite";

import type { DoraComparison } from "../../analyses/dora-metrics/view-model.js";
import DoraComparisonCards from "./DoraComparisonCards.js";

const meta = {
  title: "Explore/Flow/DoraComparisonCards",
  component: DoraComparisonCards,
} satisfies Meta<typeof DoraComparisonCards>;

export default meta;
type Story = StoryObj<typeof meta>;

// Deliberately mixed: deploys down (bad, more merges is the "good" direction),
// lead time up (bad, less is good), failure rate flat (neutral), MTTR down
// (good) — exercises all three delta tones in one story.
const mixed: DoraComparison = {
  current: {
    deploymentFrequency: 9,
    leadTimeForChangesHours: 30.2,
    changeFailureRatePercent: 11.1,
    mttrHours: 5.0,
  },
  previous: {
    deploymentFrequency: 12,
    leadTimeForChangesHours: 24.0,
    changeFailureRatePercent: 11.1,
    mttrHours: 8.2,
  },
  delta: {
    deploymentFrequency: -3,
    leadTimeForChangesHours: 6.2,
    changeFailureRatePercent: 0,
    mttrHours: -3.2,
  },
};

export const Typical: Story = {
  args: { comparison: mixed },
};

// Progressing period (e.g. the current week is only 3 days in): comparing to
// the previous full period would always read as worse, so no comparison row
// is shown at all (docs/explore-screens.md 進行中期間の前期間比較).
export const NoComparison: Story = {
  args: {
    comparison: {
      current: {
        deploymentFrequency: 7,
        leadTimeForChangesHours: 16.8,
        changeFailureRatePercent: 14.3,
        mttrHours: 5.5,
      },
      previous: null,
      delta: null,
    },
  },
};

// Zero merged PRs this period: lead time / failure rate / MTTR all read
// "データなし" rather than N/A or 0%, distinct from the "0 reverts, but PRs did
// merge" case below. The deploy card still gets a delta (the count is always
// defined), but every other delta is null because their current-side
// denominator is null (docs/explore-screens.md データと数値の方針).
export const NoMergedPrs: Story = {
  args: {
    comparison: {
      current: {
        deploymentFrequency: 0,
        leadTimeForChangesHours: null,
        changeFailureRatePercent: null,
        mttrHours: null,
      },
      previous: {
        deploymentFrequency: 4,
        leadTimeForChangesHours: 20.0,
        changeFailureRatePercent: 0,
        mttrHours: null,
      },
      delta: {
        deploymentFrequency: -4,
        leadTimeForChangesHours: null,
        changeFailureRatePercent: null,
        mttrHours: null,
      },
    },
  },
};

// PRs merged, zero were reverts: "Revert 0件(n=22)" on both cards, not "N/A".
// The MTTR delta is null even though `previous.mttrHours` exists, because
// `current.mttrHours` is null (no revert this period to average) — the delta
// tracks the *current* period's denominator, not the previous one's.
export const RevertZero: Story = {
  args: {
    comparison: {
      current: {
        deploymentFrequency: 22,
        leadTimeForChangesHours: 10.5,
        changeFailureRatePercent: 0,
        mttrHours: null,
      },
      previous: {
        deploymentFrequency: 19,
        leadTimeForChangesHours: 13.2,
        changeFailureRatePercent: 5.3,
        mttrHours: 2.0,
      },
      delta: {
        deploymentFrequency: 3,
        leadTimeForChangesHours: -2.7,
        changeFailureRatePercent: -5.3,
        mttrHours: null,
      },
    },
  },
};
