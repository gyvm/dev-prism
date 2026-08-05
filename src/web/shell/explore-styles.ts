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
export const EXPLORE_STYLES = `
/* Every control in the filter bar is --control-h tall and box-sizing:border-box,
   so the row aligns on one baseline regardless of which element type (button,
   select, the React Aria group, the multiselect trigger) draws it. Before this,
   each control sized itself from its own padding and the row stair-stepped. */
.explore-filters { --control-h: 32px; display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin: 14px 0; }
.explore-field { display: grid; gap: 3px; font-size: 12px; color: var(--fg-muted); }
.explore-field input, .explore-field select { height: var(--control-h); box-sizing: border-box; font-size: 13px; padding: 0 8px; border: 1px solid var(--border-default); border-radius: 6px; }
/* The bot toggle is a checkbox with its label beside it, not above it: a 16px
   box under a caption leaves the row visibly short and left-hugging. */
.explore-field-inline { display: flex; flex-direction: row-reverse; align-items: center; justify-content: flex-end; gap: 7px; height: var(--control-h); }
.explore-field-inline input[type="checkbox"] { width: 16px; height: 16px; padding: 0; }
.explore-filters button[type="submit"] { align-self: flex-end; height: var(--control-h); box-sizing: border-box; padding: 0 16px; border: 0; border-radius: 6px; background: var(--accent-cyan); color: var(--panel); font-size: 13px; font-weight: 650; cursor: pointer; }
.explore-filters button[type="submit"]:hover { background: color-mix(in srgb, var(--accent-cyan) 85%, black); }
.explore-content { margin-top: 16px; }
.explore-status { color: var(--fg-muted); font-size: 13px; margin: 0 0 10px; }
/* Period picker (presets + React Aria DateRangePicker) spans its own row. */
.explore-period { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
.explore-presets { display: flex; flex-wrap: wrap; gap: 6px; }
.explore-preset { display: inline-flex; align-items: center; height: var(--control-h); box-sizing: border-box; padding: 0 12px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--panel); font-size: 12px; font-weight: 600; color: var(--fg-default); cursor: pointer; transition: border-color .12s ease, background .12s ease; }
.explore-preset:hover { border-color: var(--accent-cyan); background: #f0fbfd; }
.explore-preset:focus-visible { outline: 2px solid var(--accent-blue); outline-offset: 1px; }
/* Time-axis controls are greyed out on views a period does not apply to (滞留).
   :disabled beats :hover here by coming later in the cascade at equal weight. */
.explore-preset:disabled, .explore-preset:disabled:hover { border-color: var(--border-default); background: var(--bg-muted); color: var(--fg-subtle); cursor: not-allowed; }
.explore-field select:disabled { background: var(--bg-muted); color: var(--fg-subtle); cursor: not-allowed; }

/* React Aria DateRangePicker — DESIGN.md tokens (cyan accent, no purple). */
.rac-group { display: inline-flex; align-items: center; height: var(--control-h); box-sizing: border-box; gap: 4px; padding: 0 5px 0 10px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--panel); transition: border-color .12s ease, box-shadow .12s ease; }
.rac-group[data-focus-within] { border-color: var(--accent-cyan); box-shadow: 0 0 0 3px rgba(8,145,178,.12); }
.rac-dateinput { display: inline-flex; padding: 1px 2px; font-size: 13px; font-variant-numeric: tabular-nums; color: var(--fg-default); white-space: nowrap; }
.rac-segment { padding: 1px 2px; border-radius: 4px; outline: none; color: var(--fg-default); text-align: end; }
.rac-segment[data-placeholder] { color: #a4adb8; font-style: normal; }
.rac-segment[data-focused] { background: var(--accent-cyan); color: var(--panel); }
.rac-dash { color: var(--fg-subtle); font-size: 12px; padding: 0 2px; }
.rac-calbtn { display: inline-grid; place-items: center; width: 26px; height: 26px; margin-left: 2px; border: 0; border-radius: 6px; background: var(--bg-muted); font-size: 13px; line-height: 1; cursor: pointer; }
.rac-calbtn[data-hovered] { background: #dceef2; }
.rac-calbtn[data-focus-visible] { outline: 2px solid var(--accent-blue); outline-offset: 1px; }
.rac-group[data-disabled] { background: var(--bg-muted); cursor: not-allowed; }
.rac-group[data-disabled] .rac-dateinput, .rac-group[data-disabled] .rac-segment, .rac-group[data-disabled] .rac-dash { color: var(--fg-subtle); }
.rac-calbtn[data-disabled] { opacity: .5; cursor: not-allowed; }
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
.explore-ms__btn { min-width: 130px; height: var(--control-h); box-sizing: border-box; text-align: left; padding: 0 9px; border: 1px solid var(--border-default); border-radius: 6px; background: var(--panel); font-size: 13px; color: var(--fg-default); cursor: pointer; }
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
.explore-main { max-width: 1100px; margin: 0 auto; padding: 20px 20px 48px; }
/* The sidebar toggle is position:fixed at 12px/12px and 40px square, so it
   occupies x < 52px. While the centered container's left margin clears that,
   the two never meet; below it the toggle lands on top of the <h1>. 1220px =
   1100 content + 2×(52 toggle + 8 breathing room). */
@media (max-width: 1220px) { .explore-main { padding-top: 56px; } }
/* Basic, operational UI treatment for Explore only. PAGE_STYLES is also used
   by generated reports, so keep this delta scoped to the interactive island. */
body:has(.explore-main)::before { content: none; }
.explore-main section { border-radius: 10px; box-shadow: none; }
.explore-main .metric-card { border-top: 1px solid var(--border-muted); box-shadow: none; }
.explore-main .metric-card:hover, .explore-main .metric-card:focus-visible { border-color: var(--border-default); border-top-color: var(--border-default); background: var(--panel-subtle); }
.explore-main .bg-node { border-radius: 6px; background: var(--panel); }
.explore-main .bg-dot { border-radius: 3px; }
.explore-main .bg-root[data-hovered] .bg-node.bg-active { background: color-mix(in srgb, var(--accent-cyan) 8%, var(--panel)); box-shadow: none; }
.explore-main .bg-root[data-hovered] .bg-node.bg-active .bg-bar { background: color-mix(in srgb, var(--accent-cyan) 12%, transparent); border-color: color-mix(in srgb, var(--accent-cyan) 24%, transparent); }
/* DORA comparison cards (1-1b). Reuses .metric-grid/.metric-card/the four
   metric-card-TONE accent colors from PAGE_STYLES (report parity); these
   two rules are the delta/n addition that only exists in Explore. */
.metric-card-n { display: block; margin-top: 4px; color: var(--fg-subtle); font-size: 11px; }
/* A card whose headline is a placeholder ("—") keeps its category accent on the
   top border but drops the value to neutral. The tone colors are verdicts —
   danger for failure rate, success for MTTR — and applying one to a metric that
   was never measured is the wrong claim in both directions. */
.metric-card-muted strong { color: var(--fg-subtle); }
.metric-card-delta { margin: 6px 0 0; font-size: 12px; font-weight: 650; }
.metric-card-delta-good { color: var(--success); }
.metric-card-delta-bad { color: var(--danger); }
.metric-card-delta-neutral { color: var(--fg-muted); }
/* Cycle-time funnel (1-2): four stage cards, no aggregate total by design
   (docs/explore-screens.md — p50s do not sum). */
.cycle-funnel-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.cycle-funnel-card { display: block; border: 1px solid var(--border-muted); border-radius: 8px; padding: 12px 13px; min-height: 96px; background: var(--panel); box-shadow: none; color: inherit; text-decoration: none; transition: border-color .12s ease, background-color .12s ease; }
a.cycle-funnel-card:hover, a.cycle-funnel-card:focus-visible { border-color: var(--accent-cyan); background: var(--panel-subtle); }
a.cycle-funnel-card:focus-visible { outline: 2px solid rgba(37,99,235,.28); outline-offset: 2px; }
.cycle-funnel-label { display: block; color: var(--fg-muted); font-size: 13px; font-weight: 650; }
.cycle-funnel-value { display: block; font-size: 22px; line-height: 1.15; margin: 13px 0 0; color: var(--accent-cyan); }
/* Same rule as .metric-card-muted one section up: a stage with no median shows
   the "—" placeholder in neutral, not in the accent that says "here is your
   measurement". Keeps an empty stage from out-shouting the ones with data. */
.cycle-funnel-card-muted .cycle-funnel-value { color: var(--fg-subtle); }
.cycle-funnel-n { display: block; margin-top: 4px; color: var(--fg-subtle); font-size: 11px; }
/* Trend chart (Explore-only; the frozen report has no trend section).
   Marks stay thin and the grid recessive so the data reads first. */
.trend { background: var(--panel); border: 1px solid var(--border-default); border-radius: 10px; padding: 20px; margin-top: 18px; box-shadow: none; }
.trend h2 { display: flex; align-items: baseline; gap: 10px; margin: 0 0 12px; }
.trend-grain { color: var(--fg-subtle); font-size: 12px; font-weight: 600; }
.trend-empty { color: var(--fg-muted); margin: 0; font-size: 13px; }
.trend-legend { display: flex; gap: 14px; margin: 0 0 10px; padding: 0; list-style: none; color: var(--fg-muted); font-size: 12px; }
.trend-legend li { display: flex; align-items: center; gap: 6px; }
.trend-swatch { width: 10px; height: 10px; border-radius: 3px; }
.chart-scroll { overflow-x: auto; }
.trend-svg { display: block; width: 100%; max-width: 960px; height: auto; aspect-ratio: 720 / 200; margin: 0 auto; overflow: visible; }
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

/* Reviewless-merge card (2-1): a single .metric-card, narrower than the
   4-across DORA grid, plus the note line for the "n / merged n" readout that
   MetricCards' hover tooltip pattern doesn't need here (always visible). */
.metric-grid-single { grid-template-columns: minmax(0, 240px); }
/* 3 cards in the 4-column .metric-grid leave a hole; give aging its own count.
   EXPLORE_STYLES is injected after PAGE_STYLES, so the base grid's media
   queries lose to this rule — restate the collapse points here. */
.metric-grid-triple { grid-template-columns: repeat(3, minmax(0, 1fr)); }
@media (max-width: 860px) { .metric-grid-triple { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .metric-grid-triple { grid-template-columns: 1fr; } }
.metric-card-reviewless { --metric-tone: var(--danger); }
.metric-card-note { margin: 8px 0 0; color: var(--fg-muted); font-size: 12px; line-height: 1.4; }

/* Size × pickup scatter (2-3). Grid/axis-tick/empty/readout/table classes are
   shared with .trend-* (TrendChart) and .empty (PAGE_STYLES) — generic enough
   to reuse verbatim; only the plot height and mark styling are scatter-specific. */
.scatter-svg { display: block; width: 100%; max-width: 960px; height: auto; aspect-ratio: 720 / 320; margin: 0 auto; overflow: visible; }
.scatter-axis-label { fill: var(--fg-muted); font-size: 11px; font-weight: 650; }
.scatter-point { fill: var(--accent-cyan); fill-opacity: .72; stroke: var(--panel); stroke-width: 1; transition: fill-opacity .1s ease, stroke .1s ease; }
.scatter-point-active { fill-opacity: 1; stroke: var(--accent-blue); stroke-width: 1.5; }
.scatter-point-link { cursor: pointer; }
/* Points past the axis maximum, pinned to the right edge. Hollow so a pile-up
   at the boundary never reads as a real cluster of measurements there. */
.scatter-point-clipped { fill: none; stroke: var(--accent-cyan); stroke-width: 1.5; stroke-dasharray: 2 2; }

/* Reviewer lead-time bars (2-5). Bars are plain divs sized by %, the same
   width-as-percentage idiom BipartiteGraph's .bg-bar uses, rather than another
   SVG chart — there is no axis to share across rows, just a relative compare. */
.reviewer-lead-list { display: grid; gap: 10px; margin: 12px 0 0; padding: 0; list-style: none; }
.reviewer-lead-row { display: grid; grid-template-columns: minmax(100px, 160px) minmax(0, 1fr) auto; gap: 12px; align-items: center; }
.reviewer-lead-name { color: var(--fg-default); font-size: 13px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reviewer-lead-bar-wrap { position: relative; height: 14px; border-radius: 999px; background: var(--bg-muted); overflow: hidden; }
.reviewer-lead-bar { position: absolute; inset: 0 auto 0 0; height: 100%; border-radius: 999px; background: var(--accent-cyan); }
.reviewer-lead-value { color: var(--fg-muted); font-size: 12px; white-space: nowrap; }
.reviewer-lead-pending { color: var(--attention); font-weight: 650; }

/* Stage-time table (3-2) and aging table (4-2). Both are plain data tables
   sharing the same chrome; only the header/cell text-align is per-column
   (via [data-align], the same "leave the dynamic bit as a data attribute"
   idiom aria-sort already uses here) and stays out of the shared rule. */
.stage-table-wrap, .aging-table-wrap { overflow-x: auto; }
.stage-table, .aging-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.stage-table th, .aging-table th { text-align: left; padding: 6px 10px; white-space: nowrap; border-bottom: 1px solid var(--border-default); }
.stage-table td, .aging-table td { padding: 6px 10px; border-bottom: 1px solid var(--border-muted); }
.stage-table th[data-align="right"], .stage-table td[data-align="right"],
.aging-table th[data-align="right"], .aging-table td[data-align="right"] { text-align: right; }
.stage-table-sort-btn { all: unset; cursor: pointer; font-weight: 650; color: var(--fg-default); }

/* Aging status badges (4-2). Tones are the existing DESIGN.md accents at low
   alpha, expressed with color-mix() against transparent so the fill/border
   stay derived from the token instead of a re-typed rgba() literal. */
.aging-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 650; white-space: nowrap; border: 1px solid transparent; }
.aging-badge-draft { color: var(--fg-muted); background: color-mix(in srgb, var(--fg-subtle) 12%, transparent); border-color: color-mix(in srgb, var(--fg-subtle) 28%, transparent); }
.aging-badge-awaiting_review { color: var(--attention); background: color-mix(in srgb, var(--attention) 12%, transparent); border-color: color-mix(in srgb, var(--attention) 28%, transparent); }
.aging-badge-changes_requested { color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent); border-color: color-mix(in srgb, var(--danger) 28%, transparent); }
.aging-badge-approved { color: var(--success); background: color-mix(in srgb, var(--success) 12%, transparent); border-color: color-mix(in srgb, var(--success) 28%, transparent); }

/* Aging histogram (4-3). Bar height % is per-bucket data, so it stays an
   inline style; tone and typography move here. */
.aging-histogram { display: flex; align-items: flex-end; gap: 16px; height: 160px; padding: 8px 4px 0; }
.aging-histogram-col { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 6px; height: 100%; }
.aging-histogram-count { font-size: 12px; color: var(--fg-muted); }
.aging-histogram-count[data-empty="true"] { color: var(--fg-subtle); opacity: .55; }
.aging-histogram-bar { width: 100%; max-width: 56px; background: var(--accent-cyan); border-radius: 4px 4px 0 0; }
.aging-histogram-bar[data-empty="true"] { background: var(--border-muted); }
.aging-histogram-label { font-size: 12px; color: var(--fg-subtle); }

/* PR timeline (gantt) track (1-3/Timeline). Replaces the report's pill rail +
   repeating-gradient day grid with the flat bordered vocabulary the rest of
   Explore uses (compare .aging-histogram-bar's border-radius, .trend-grid's
   thin border-left day dividers). legend-swatch/timeline-tooltip-swatch stay
   circular in PAGE_STYLES for the frozen report; these gantt-* parallels are
   Explore-only so they can go square without touching the shared classes. */
.gantt-track { position: relative; height: 20px; border: 1px solid var(--border-muted); border-radius: 4px; background: var(--bg-muted); overflow: hidden; cursor: help; }
.gantt-daygrid { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(7, 1fr); pointer-events: none; }
.gantt-daygrid-cell:not(:first-child) { border-left: 1px solid var(--border-muted); }
/* min-width, because the width % is a fraction of the *window*: a PR that lived
   four hours inside a one-year Explore range computes to well under a pixel and
   vanishes. 3px is the floor at which a segment still reads as a mark. */
.gantt-segment { position: absolute; top: 0; bottom: 0; min-width: 3px; border-right: 1px solid var(--panel); }
.gantt-segment:last-child { border-right: 0; }
.timeline-row[data-closed-unmerged="true"] .gantt-track { border-style: dashed; border-color: var(--border-default); background: var(--bg-muted); }
.timeline-row[data-closed-unmerged="true"] .gantt-segment { filter: grayscale(.7) opacity(.6); }
.gantt-legend-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; }
.gantt-legend-swatch-closed { background: repeating-linear-gradient(135deg, var(--fg-subtle) 0 3px, transparent 3px 6px); border: 1px dashed var(--fg-subtle); border-radius: 2px; }
.gantt-tooltip-swatch { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 2px; margin-top: 5px; }
.timeline-more { display: block; width: 100%; margin-top: 12px; padding: 9px 12px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--panel); color: var(--accent-blue); font-size: 13px; font-weight: 650; cursor: pointer; }
.timeline-more:hover { border-color: var(--accent-cyan); background: var(--panel-subtle); }
.timeline-more:focus-visible { outline: 2px solid var(--accent-blue); outline-offset: 1px; }

/* Gantt sort control. Stacked above the legend rather than beside it: both sit
   in the right-hand slot of .section-head, and side by side they wrap the
   legend onto a second line at narrow widths. Toggling repeats StageTimeTable's
   idiom — click the active key to flip direction — so both halves of the
   Timeline view sort the same way. */
.timeline-head-aside { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.timeline-sort { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 6px; font-size: 12px; }
.timeline-sort-label { color: var(--fg-subtle); }
.timeline-sort-btn { height: 24px; padding: 0 10px; border: 1px solid var(--border-default); border-radius: 999px; background: var(--panel); color: var(--fg-muted); font-size: 12px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: border-color .12s ease, background .12s ease; }
.timeline-sort-btn:hover { border-color: var(--accent-cyan); background: var(--panel-subtle); }
.timeline-sort-btn[aria-pressed="true"] { border-color: var(--accent-blue); background: var(--panel-subtle); color: var(--fg-default); }
.timeline-sort-btn:focus-visible { outline: 2px solid var(--accent-blue); outline-offset: 1px; }

/* View tabs (flow / review / timeline). */
.explore-tabs { display: flex; gap: 4px; max-width: 1100px; margin: 0 auto; padding: 20px 20px 0; }
.explore-main .explore-tabs { max-width: none; margin: 0; padding: 20px 0 0; }
.explore-tab { padding: 7px 14px; border: 1px solid transparent; border-radius: 6px; color: var(--fg-muted); font-size: 13px; font-weight: 650; text-decoration: none; }
.explore-tab:hover { background: var(--bg-muted); color: var(--fg-default); }
.explore-tab.is-active { border-color: transparent; background: var(--panel-subtle); color: var(--accent-cyan); }
.explore-tab:focus-visible { outline: 2px solid var(--accent-blue); outline-offset: 1px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; }
}
`;
