import type { Meta, StoryObj } from "@storybook/react-vite";

import type { AgingPr, AgingTable as AgingTableData } from "../../analyses/aging/view-model.js";
import AgingTable from "./AgingTable.js";

// Age-descending order is the data layer's contract; fixtures are pre-sorted
// to match what the real query would hand this component.
const prs: readonly AgingPr[] = [
  {
    number: 512,
    title: "Investigate flaky nightly build",
    url: "https://github.com/gyvm/dev-prism/pull/512",
    repoKey: "gyvm/dev-prism",
    author: "hkondo",
    status: "awaiting_review",
    ballHolder: "smorita",
    ageHours: 12000, // ~500h
    createdAt: "2026-01-25T03:00:00Z",
    updatedAt: "2026-02-01T09:00:00Z",
  },
  {
    number: 507,
    title: "Draft: exploratory bulk-import rewrite",
    url: "https://github.com/gyvm/dev-prism/pull/507",
    repoKey: "gyvm/dev-prism",
    author: "tnakamura",
    status: "draft",
    ballHolder: "tnakamura",
    ageHours: 340.5,
    createdAt: "2026-07-08T02:00:00Z",
    updatedAt: "2026-07-20T14:00:00Z",
  },
  {
    number: 503,
    title: "Address review feedback on scope-sql helper",
    url: "https://github.com/gyvm/dev-prism/pull/503",
    repoKey: "gyvm/dev-prism",
    author: "ysakamoto",
    status: "changes_requested",
    ballHolder: "ysakamoto",
    ageHours: 96.2,
    createdAt: "2026-07-18T10:00:00Z",
    updatedAt: "2026-07-21T18:30:00Z",
  },
  {
    number: 499,
    title: "Approved, waiting for a maintainer to merge",
    url: "https://github.com/gyvm/dev-prism/pull/499",
    repoKey: "gyvm/other-repo",
    author: "kfujita",
    status: "approved",
    ballHolder: "kfujita",
    ageHours: 40.0,
    createdAt: "2026-07-20T08:00:00Z",
    updatedAt: "2026-07-22T02:00:00Z",
  },
  {
    number: 495,
    title: "Small fix, no reviewer assigned yet",
    url: "https://github.com/gyvm/dev-prism/pull/495",
    repoKey: "gyvm/dev-prism",
    author: null,
    status: "awaiting_review",
    ballHolder: null,
    ageHours: 2.3,
    createdAt: "2026-07-22T21:00:00Z",
    updatedAt: "2026-07-22T21:40:00Z",
  },
];

const meta = {
  title: "Explore/Wip/AgingTable",
  component: AgingTable,
} satisfies Meta<typeof AgingTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStatuses: Story = {
  args: { table: { prs } satisfies AgingTableData },
};

export const Empty: Story = {
  args: { table: { prs: [] } satisfies AgingTableData },
};
