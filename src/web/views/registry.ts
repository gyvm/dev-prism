import type { ReactElement } from "react";

import type { Scope } from "../../analyses/scope.js";
import type { DwhQueryRunner } from "../../warehouse/runner.js";
import { renderFlowView } from "./FlowView.js";
import { renderReviewView } from "./ReviewView.js";
import { renderTimelineView } from "./TimelineView.js";
import { renderWipView } from "./WipView.js";

/**
 * The Explore views. Adding an insight means adding one entry here plus its
 * React component — the contract the whole plan is built around
 * (docs/explore-views-plan.md).
 *
 * Each view owns its own query so the registry stays free of per-view data
 * types; the alternative (a generic `{load, Component}` pair) leaks a type
 * parameter into every consumer for no gain.
 */
/**
 * `now` is the reference instant for views that ask about the present rather
 * than a window (the wip backlog). It is passed in rather than read inside a
 * view so the query layer stays deterministic and testable — the aging queries
 * already take an explicit `now`, and calling `new Date()` one level up would
 * hand that determinism straight back.
 */
export type ViewRenderer = (
  runner: DwhQueryRunner,
  scope: Scope,
  now: Date,
) => Promise<ReactElement>;

export type ViewDefinition = Readonly<{
  id: ViewId;
  label: string;
  render: ViewRenderer;
}>;

export const VIEW_IDS = ["flow", "review", "timeline", "wip"] as const;

export type ViewId = (typeof VIEW_IDS)[number];

export const DEFAULT_VIEW: ViewId = "flow";

export const VIEWS: Readonly<Record<ViewId, ViewDefinition>> = {
  flow: { id: "flow", label: "フロー", render: renderFlowView },
  review: { id: "review", label: "レビュー", render: renderReviewView },
  timeline: { id: "timeline", label: "タイムライン", render: renderTimelineView },
  wip: { id: "wip", label: "滞留", render: renderWipView },
};

export function isViewId(value: string | null | undefined): value is ViewId {
  return value != null && (VIEW_IDS as readonly string[]).includes(value);
}

/** Resolves a view id from a URL segment, falling back to the default. */
export function resolveViewId(value: string | null | undefined): ViewId {
  return isViewId(value) ? value : DEFAULT_VIEW;
}
