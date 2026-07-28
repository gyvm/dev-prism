/**
 * Rows a per-PR list renders before it offers to show the rest.
 *
 * The frozen weekly report never needs this — a week is a few dozen PRs. Explore
 * hands the same components an arbitrary window, and a year preset puts 300+
 * rows on the page: tens of thousands of pixels of scroll in which no row is
 * comparable to any other. 40 fills roughly two screens, which is about as much
 * as the eye holds at once.
 *
 * Shared by the two Timeline components (GanttChart, StageTimeTable) so the one
 * screen does not cut off at two different depths.
 */
export const VISIBLE_ROW_LIMIT = 40;
