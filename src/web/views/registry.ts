import type { ReactElement } from "react";

import type { Scope } from "../../analyses/scope.js";
import type { DwhQueryRunner } from "../../warehouse/runner.js";
import { renderFlowView } from "./FlowView.js";
import { renderReviewView } from "./ReviewView.js";
import { renderTimelineView } from "./TimelineView.js";

/**
 * The Explore views. Adding an insight means adding one entry here plus its
 * React component — the contract the whole plan is built around
 * (docs/explore-views-plan.md).
 *
 * Each view owns its own query so the registry stays free of per-view data
 * types; the alternative (a generic `{load, Component}` pair) leaks a type
 * parameter into every consumer for no gain.
 */
export type ViewRenderer = (runner: DwhQueryRunner, scope: Scope) => Promise<ReactElement>;

export type ViewDefinition = Readonly<{
  id: ViewId;
  label: string;
  render: ViewRenderer;
}>;

export const VIEW_IDS = ["flow", "review", "timeline"] as const;

export type ViewId = (typeof VIEW_IDS)[number];

export const DEFAULT_VIEW: ViewId = "flow";

export const VIEWS: Readonly<Record<ViewId, ViewDefinition>> = {
  flow: { id: "flow", label: "フロー", render: renderFlowView },
  review: { id: "review", label: "レビュー", render: renderReviewView },
  timeline: { id: "timeline", label: "PR個別", render: renderTimelineView },
};

export function isViewId(value: string | null | undefined): value is ViewId {
  return value != null && (VIEW_IDS as readonly string[]).includes(value);
}

/** Resolves a view id from a URL segment, falling back to the default. */
export function resolveViewId(value: string | null | undefined): ViewId {
  return isViewId(value) ? value : DEFAULT_VIEW;
}
