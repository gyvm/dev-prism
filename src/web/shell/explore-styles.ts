// Explore shell CSS (filter bar, period picker, multiselect, view tabs).
//
// Extracted verbatim from the former pages/explore.astro so the per-view route
// keeps one copy. Injected with `is:global` because <Explore client:only>
// renders entirely in the browser, where Astro's scoped selectors never match.
//
// Palette values reference src/ui/tokens.ts through var(); the hand-inlined hex
// this file shipped with (issue ③ in docs/explore-views-plan.md) is gone.
//
// Six literals remain on purpose — interaction shades DESIGN.md does not define:
//   1d4fd7  submit-button hover (darker accent-blue)
//   a4adb8  placeholder text      c2c9d2  disabled calendar day
//   f0fbfd  preset/nav hover      dceef2  calendar-button hover
//   e0f4f8  date-range selection fill
// Promote them into DESIGN.md if they start appearing elsewhere; until then a
// token would be single-use indirection. Do not add new raw hex here.
import { renderRootCss } from "../../ui/tokens.js";

// The tokens themselves, so Explore keeps its palette once Step 4 stops
// injecting PAGE_STYLES.
export const EXPLORE_ROOT_CSS = renderRootCss();

export const EXPLORE_STYLES = `
.explore-filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin: 14px 0; }
.explore-field { display: grid; gap: 3px; font-size: 12px; color: var(--fg-muted); }
.explore-field input, .explore-field select { font-size: 13px; padding: 5px 7px; border: 1px solid var(--border-default); border-radius: 6px; }
.explore-field input[type="checkbox"] { justify-self: start; width: 16px; height: 16px; }
.explore-filters button[type="submit"] { align-self: flex-end; padding: 7px 16px; border: 0; border-radius: 6px; background: var(--accent-blue); color: var(--panel); font-size: 13px; font-weight: 650; cursor: pointer; }
.explore-filters button[type="submit"]:hover { background: #1d4fd7; }
.explore-status { color: var(--fg-muted); font-size: 13px; margin: 4px 0 0; }
/* Period picker (presets + React Aria DateRangePicker) spans its own row. */
.explore-period { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
.explore-presets { display: flex; flex-wrap: wrap; gap: 6px; }
.explore-preset { padding: 6px 12px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--panel); font-size: 12px; font-weight: 600; color: var(--fg-default); cursor: pointer; transition: border-color .12s ease, background .12s ease; }
.explore-preset:hover { border-color: var(--accent-cyan); background: #f0fbfd; }
.explore-preset:focus-visible { outline: 2px solid var(--accent-blue); outline-offset: 1px; }

/* React Aria DateRangePicker — DESIGN.md tokens (cyan accent, no purple). */
.rac-group { display: inline-flex; align-items: center; gap: 4px; padding: 5px 6px 5px 10px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--panel); transition: border-color .12s ease, box-shadow .12s ease; }
.rac-group[data-focus-within] { border-color: var(--accent-cyan); box-shadow: 0 0 0 3px rgba(8,145,178,.12); }
.rac-dateinput { display: inline-flex; padding: 1px 2px; font-size: 13px; font-variant-numeric: tabular-nums; color: var(--fg-default); white-space: nowrap; }
.rac-segment { padding: 1px 2px; border-radius: 4px; outline: none; color: var(--fg-default); text-align: end; }
.rac-segment[data-placeholder] { color: #a4adb8; font-style: normal; }
.rac-segment[data-focused] { background: var(--accent-cyan); color: var(--panel); }
.rac-dash { color: var(--fg-subtle); font-size: 12px; padding: 0 2px; }
.rac-calbtn { display: inline-grid; place-items: center; width: 26px; height: 26px; margin-left: 2px; border: 0; border-radius: 6px; background: var(--bg-muted); font-size: 13px; line-height: 1; cursor: pointer; }
.rac-calbtn[data-hovered] { background: #dceef2; }
.rac-calbtn[data-focus-visible] { outline: 2px solid var(--accent-blue); outline-offset: 1px; }
.rac-popover { background: var(--panel); border: 1px solid var(--border-default); border-radius: 12px; box-shadow: 0 12px 32px rgba(16,24,40,.16); }
.rac-dialog { padding: 12px 14px; outline: none; }
.rac-calheader { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.rac-calheading { margin: 0; font-size: 13px; font-weight: 700; color: var(--fg-default); text-align: center; flex: 1; }
.rac-navbtn { width: 28px; height: 28px; border: 1px solid var(--border-muted); border-radius: 7px; background: var(--panel); color: var(--fg-default); font-size: 15px; line-height: 1; cursor: pointer; }
.rac-navbtn[data-hovered] { border-color: var(--accent-cyan); background: #f0fbfd; }
.rac-navbtn[data-focus-visible] { outline: 2px solid var(--accent-blue); outline-offset: 1px; }
.rac-calgrids { display: flex; gap: 18px; }
.rac-calgrid { border-collapse: collapse; }
.rac-calgrid th { padding: 4px; font-size: 11px; font-weight: 600; color: var(--fg-subtle); }
.rac-calcell { width: 32px; height: 30px; text-align: center; font-size: 12px; color: var(--fg-default); border-radius: 7px; cursor: pointer; outline: none; }
.rac-calcell[data-outside-month] { display: none; }
.rac-calcell[data-hovered] { background: var(--bg-muted); }
.rac-calcell[data-selected] { background: #e0f4f8; border-radius: 0; }
.rac-calcell[data-selection-start] { border-top-left-radius: 7px; border-bottom-left-radius: 7px; }
.rac-calcell[data-selection-end] { border-top-right-radius: 7px; border-bottom-right-radius: 7px; }
.rac-calcell[data-selection-start], .rac-calcell[data-selection-end] { background: var(--accent-cyan); color: var(--panel); font-weight: 700; }
.rac-calcell[data-focus-visible] { outline: 2px solid var(--accent-blue); outline-offset: -2px; }
.rac-calcell[data-disabled] { color: #c2c9d2; cursor: default; }
/* Searchable repo/user multiselect. */
.explore-ms { position: relative; }
.explore-ms__btn { min-width: 130px; text-align: left; padding: 5px 9px; border: 1px solid var(--border-default); border-radius: 6px; background: var(--panel); font-size: 13px; color: var(--fg-default); cursor: pointer; }
.explore-ms__btn:hover:not(:disabled) { border-color: var(--accent-cyan); }
.explore-ms__btn:disabled { color: #a4adb8; cursor: default; }
.explore-ms__panel { position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; width: 240px; max-height: 280px; overflow: auto; padding: 8px; background: var(--panel); border: 1px solid var(--border-default); border-radius: 8px; box-shadow: 0 6px 18px rgba(16,24,40,.12); }
.explore-ms__search { width: 100%; box-sizing: border-box; margin-bottom: 6px; padding: 5px 7px; border: 1px solid var(--border-default); border-radius: 6px; font-size: 13px; }
.explore-ms__clear { display: block; width: 100%; text-align: left; padding: 4px 6px; border: 0; background: none; color: var(--accent-cyan); font-size: 12px; cursor: pointer; }
.explore-ms__list { list-style: none; margin: 0; padding: 0; }
.explore-ms__opt { display: flex; align-items: center; gap: 7px; padding: 5px 6px; border-radius: 6px; font-size: 13px; cursor: pointer; }
.explore-ms__opt:hover { background: var(--bg-muted); }
.explore-ms__opt input { width: 15px; height: 15px; }
.explore-ms__empty { padding: 8px 6px; color: var(--fg-subtle); font-size: 13px; }
/* Clear the fixed sidebar toggle (top-left) so the heading is not covered. */
.explore-main { max-width: 1100px; margin: 0 auto; padding: 56px 20px 48px; }
/* Trend chart (Explore-only; the frozen report has no trend section).
   Marks stay thin and the grid recessive so the data reads first. */
.trend { background: var(--panel); border: 1px solid var(--border-default); border-radius: 12px; padding: 20px; margin-top: 18px; }
.trend h2 { display: flex; align-items: baseline; gap: 10px; margin: 0 0 12px; }
.trend-grain { color: var(--fg-subtle); font-size: 12px; font-weight: 600; }
.trend-empty { color: var(--fg-muted); margin: 0; font-size: 13px; }
.trend-legend { display: flex; gap: 14px; margin: 0 0 10px; padding: 0; list-style: none; color: var(--fg-muted); font-size: 12px; }
.trend-legend li { display: flex; align-items: center; gap: 6px; }
.trend-swatch { width: 10px; height: 10px; border-radius: 3px; }
.trend-svg { display: block; width: 100%; height: 200px; overflow: visible; }
.trend-grid { stroke: var(--border-muted); stroke-width: 1; }
.trend-axis { fill: var(--fg-subtle); font-size: 10px; }
.trend-crosshair { stroke: var(--border-default); stroke-width: 1; stroke-dasharray: 3 3; }
.trend-line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.trend-dot { stroke: var(--panel); stroke-width: 2; }
.trend-endlabel { font-size: 11px; font-weight: 650; }
.trend-readout { min-height: 18px; margin: 6px 0 0; color: var(--fg-muted); font-size: 12px; }
.trend-table { margin-top: 10px; }
.trend-table summary { color: var(--accent-blue); font-size: 12px; cursor: pointer; }
.trend-table table { width: 100%; margin-top: 8px; border-collapse: collapse; font-size: 12px; }
.trend-table th, .trend-table td { padding: 4px 8px; border-bottom: 1px solid var(--border-muted); text-align: right; }
.trend-table thead th, .trend-table tbody th { text-align: left; color: var(--fg-muted); font-weight: 650; }

/* View tabs (flow / review / timeline). */
.explore-tabs { display: flex; gap: 4px; max-width: 1100px; margin: 0 auto; padding: 20px 20px 0; }
.explore-tab { padding: 7px 14px; border: 1px solid transparent; border-radius: 8px 8px 0 0; color: var(--fg-muted); font-size: 13px; font-weight: 650; text-decoration: none; }
.explore-tab:hover { background: var(--bg-muted); color: var(--fg-default); }
.explore-tab.is-active { border-color: var(--border-default); border-bottom-color: var(--panel); background: var(--panel); color: var(--accent-cyan); }
.explore-tab:focus-visible { outline: 2px solid var(--accent-blue); outline-offset: 1px; }
/* The tabs own the top padding now, so the island's heading sits under them. */
.explore-main { padding-top: 20px; }
`;
