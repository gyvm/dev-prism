import type { Meta, StoryObj } from "@storybook/react-vite";

import type { PrTimelineOutput } from "../../analyses/pr-timeline/compute.js";
import GanttChart from "./GanttChart.js";

const meta = {
  title: "Explore/Timeline/GanttChart",
  component: GanttChart,
} satisfies Meta<typeof GanttChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const weekStart = "2026-07-13T00:00:00.000Z";
const weekEnd = "2026-07-20T00:00:00.000Z";
const timezone = "Asia/Tokyo";

const mixed: PrTimelineOutput = {
  weekStart,
  weekEnd,
  timezone,
  timelines: [
    {
      repo: { owner: "gyvm", name: "dev-prism" },
      number: 512,
      title: "Add page-level Explore stories",
      author: "hoshino",
      totalDurationHours: 45,
      segments: [
        { state: "implementing", startAt: "2026-07-14T01:00:00.000Z", endAt: "2026-07-15T02:00:00.000Z", durationHours: 25 },
        { state: "wait_review", startAt: "2026-07-15T02:00:00.000Z", endAt: "2026-07-15T16:00:00.000Z", durationHours: 14 },
        { state: "wait_merge", startAt: "2026-07-15T16:00:00.000Z", endAt: "2026-07-15T22:00:00.000Z", durationHours: 6 },
      ],
      auxiliary: {
        firstCommitAt: "2026-07-14T01:00:00.000Z",
        readyForReviewAt: "2026-07-15T02:00:00.000Z",
        firstReaction: { at: "2026-07-15T04:30:00.000Z", by: "amamiya" },
        firstApproveAt: "2026-07-15T14:30:00.000Z",
        approveCount: 1,
        dismissCount: 0,
        reviewCommentCount: 3,
        postApproveCommitCount: 0,
        closingState: "merged",
        mergedAt: "2026-07-15T22:00:00.000Z",
        closedAt: "2026-07-15T22:00:00.000Z",
      },
    },
    {
      repo: { owner: "gyvm", name: "other-repo" },
      number: 107,
      title: "Rework the collection window",
      author: "kaede",
      totalDurationHours: 71,
      segments: [
        { state: "implementing", startAt: "2026-07-14T06:00:00.000Z", endAt: "2026-07-15T18:00:00.000Z", durationHours: 36 },
        { state: "wait_review", startAt: "2026-07-15T18:00:00.000Z", endAt: "2026-07-16T20:00:00.000Z", durationHours: 26 },
        { state: "fixing", startAt: "2026-07-16T20:00:00.000Z", endAt: "2026-07-17T05:00:00.000Z", durationHours: 9 },
      ],
      auxiliary: {
        firstCommitAt: "2026-07-14T06:00:00.000Z",
        readyForReviewAt: "2026-07-15T18:00:00.000Z",
        firstReaction: { at: "2026-07-16T02:10:00.000Z", by: "nagi" },
        firstApproveAt: null,
        approveCount: 0,
        dismissCount: 0,
        reviewCommentCount: 6,
        postApproveCommitCount: 1,
        closingState: "open",
        mergedAt: null,
        closedAt: null,
      },
    },
    {
      repo: { owner: "gyvm", name: "dev-prism" },
      number: 509,
      title: "Remove obsolete dashboard entry point",
      author: "hoshino",
      totalDurationHours: 29,
      segments: [
        { state: "implementing", startAt: "2026-07-16T03:00:00.000Z", endAt: "2026-07-16T14:00:00.000Z", durationHours: 11 },
        { state: "wait_review", startAt: "2026-07-16T14:00:00.000Z", endAt: "2026-07-17T08:00:00.000Z", durationHours: 18 },
      ],
      auxiliary: {
        firstCommitAt: "2026-07-16T03:00:00.000Z",
        readyForReviewAt: "2026-07-16T14:00:00.000Z",
        firstReaction: { at: "2026-07-16T19:00:00.000Z", by: "reviewer-bot" },
        firstApproveAt: null,
        approveCount: 0,
        dismissCount: 0,
        reviewCommentCount: 1,
        postApproveCommitCount: 0,
        closingState: "closed_unmerged",
        mergedAt: null,
        closedAt: "2026-07-17T08:00:00.000Z",
      },
    },
  ],
};

export const Mixed: Story = { args: mixed };

export const AllClosedUnmerged: Story = {
  args: {
    weekStart,
    weekEnd,
    timezone,
    timelines: mixed.timelines.map((timeline) => ({
      ...timeline,
      auxiliary: {
        ...timeline.auxiliary,
        closingState: "closed_unmerged",
        mergedAt: null,
        closedAt: "2026-07-17T08:00:00.000Z",
      },
    })),
  },
};

export const Empty: Story = {
  args: { weekStart, weekEnd, timezone, timelines: [] },
};
