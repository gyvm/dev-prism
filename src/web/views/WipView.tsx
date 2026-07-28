import type { ReactElement } from "react";

import {
  queryAgingHistogram,
  queryAgingSummary,
  queryAgingTable,
} from "../../analyses/aging/query.js";
import type { Scope } from "../../analyses/scope.js";
import type { DwhQueryRunner } from "../../warehouse/runner.js";
import AgingHistogram from "./AgingHistogram.js";
import AgingSummaryCards from "./AgingSummaryCards.js";
import AgingTable from "./AgingTable.js";

// Wip (滞留): the open-PR backlog, as of now. The only Explore view that reads a
// leading indicator — the other three look back at finished work.
//
// It deliberately ignores the period filter (docs/explore-screens.md §4: a window
// on a backlog reads as "PRs opened last week", which is not the question). The
// aging SQL never applies a time range, but `agingNowTs` does fall back to
// `scope.to` as its reference instant, and the URL still carries whatever period
// another tab left there — so from/to are stripped here to keep "now" meaning now.
export async function renderWipView(
  runner: DwhQueryRunner,
  scope: Scope,
  now: Date,
): Promise<ReactElement> {
  const wipScope: Scope = { ...scope, from: null, to: null };
  const [summary, table, histogram] = await Promise.all([
    queryAgingSummary(runner, wipScope, now),
    queryAgingTable(runner, wipScope, now),
    queryAgingHistogram(runner, wipScope, now),
  ]);

  return (
    <>
      <AgingSummaryCards summary={summary} />
      <AgingTable table={table} />
      <AgingHistogram histogram={histogram} />
    </>
  );
}
