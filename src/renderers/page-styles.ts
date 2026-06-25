// Shared report/Explore CSS. Deps-free leaf so the browser (Explore) bundle can
// import it without pulling in render.ts (which imports node:fs/path).
export const PAGE_STYLES = `:root { color-scheme: light; --bg-default:#f7f9fc; --bg-muted:#eef3f8; --panel:#ffffff; --panel-subtle:#f5f8fb; --fg-default:#202733; --fg-muted:#586574; --fg-subtle:#728091; --border-default:#d6dee8; --border-muted:#e2e8f0; --accent-cyan:#0891b2; --accent-blue:#2563eb; --success:#1f8f5f; --attention:#b7791f; --danger:#c2413a; --timeline-rail:#eef3f8; --timeline-grid:rgba(88,101,116,.13); --tooltip-border:rgba(214,222,232,.95); --tooltip-bg:rgba(255,255,255,.98); --shadow:0 1px 2px rgba(32,39,51,.04), 0 8px 24px rgba(32,39,51,.06); --role-human:var(--accent-blue); --role-human-fill:rgba(37,99,235,.10); --role-human-line:rgba(37,99,235,.20); --role-bot:var(--attention); --role-bot-fill:rgba(183,121,31,.12); --role-bot-line:rgba(183,121,31,.24); }
* { box-sizing:border-box; }
body { margin:0; font-family:"Avenir Next", "Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background:var(--bg-default); color:var(--fg-default); line-height:1.5; }
body::before { content:""; position:fixed; inset:0; pointer-events:none; background:linear-gradient(180deg, rgba(255,255,255,.58), rgba(255,255,255,0) 280px); }
main { position:relative; width:100%; margin:0 auto; padding:36px clamp(20px, 4vw, 64px) 60px; }
header { margin-bottom:24px; padding:0 2px; }
h1 { margin:0; font-size:34px; font-weight:650; line-height:1.12; letter-spacing:0; overflow-wrap:anywhere; color:var(--fg-default); }
h2 { margin:0; font-size:18px; line-height:1.25; letter-spacing:0; }
.report-kicker { margin:0 0 4px; color:var(--accent-cyan); font-size:12px; font-weight:750; letter-spacing:.06em; text-transform:uppercase; }
.report-subtitle { margin:8px 0 0; color:var(--fg-muted); font-size:14px; line-height:1.45; }
.report-meta { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 0; padding:0; }
.report-meta-item { display:grid; gap:2px; min-width:150px; padding:9px 12px; border:1px solid var(--border-muted); border-radius:8px; background:rgba(255,255,255,.62); }
.report-meta-period { min-width:min(100%, 380px); }
.report-meta dt { color:var(--fg-subtle); font-size:11px; font-weight:700; line-height:1.2; }
.report-meta dd { margin:0; color:var(--fg-default); font-size:13px; line-height:1.35; overflow-wrap:anywhere; }
section { background:var(--panel); border:1px solid var(--border-default); border-radius:12px; padding:20px; margin-top:18px; box-shadow:var(--shadow); }
section > h2 { margin-bottom:16px; }
.dev-prism { display:grid; gap:18px; border-top:3px solid var(--accent-cyan); }
.dev-prism-intro { display:grid; gap:6px; max-width:860px; }
.dev-prism-intro h2 { font-size:24px; }
.dev-prism-intro p:last-child { margin:0; color:var(--fg-default); font-size:15px; line-height:1.6; }
.dev-prism-eyebrow { margin:0; color:var(--accent-cyan); font-size:11px; font-weight:750; letter-spacing:.06em; text-transform:uppercase; }
.dev-prism-section { display:grid; gap:12px; padding-top:18px; border-top:1px solid var(--border-muted); }
.dev-prism-section-heading { display:grid; gap:4px; }
.dev-prism-section-heading h3 { margin:0; font-size:17px; line-height:1.25; }
.dev-prism-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; }
.dev-prism-candidate-group { margin:0; padding:14px; border-radius:8px; box-shadow:none; background:var(--panel-subtle); border-color:var(--border-muted); }
.dev-prism-candidate-group h4 { margin:0 0 6px; font-size:13px; line-height:1.3; color:var(--fg-default); }
.dev-prism-group-desc { margin:0 0 10px; color:var(--fg-muted); font-size:12px; line-height:1.45; }
.dev-prism-pr-list { display:grid; gap:10px; margin:0; padding:0; list-style:none; }
.dev-prism-pr-list li { display:grid; gap:5px; padding-top:10px; border-top:1px solid var(--border-muted); }
.dev-prism-pr-list li:first-child { padding-top:0; border-top:0; }
.dev-prism-pr-line { display:flex; flex-wrap:wrap; gap:6px; align-items:baseline; min-width:0; }
.dev-prism-pr-line a, .dev-prism-pr-line > span:first-child { flex:0 0 auto; color:var(--accent-blue); font-size:12px; font-weight:700; text-decoration:none; }
.dev-prism-pr-line a:hover { text-decoration:underline; }
.dev-prism-pr-line strong { min-width:min(100%, 220px); color:var(--fg-default); font-size:13px; font-weight:650; line-height:1.35; overflow-wrap:anywhere; }
.dev-prism-pr-metric { color:var(--fg-muted); font-size:12px; font-weight:650; }
.dev-prism-prompt { margin:10px 0 0; color:var(--fg-default); font-size:12px; font-weight:650; line-height:1.45; }
.report-band p:not(.dev-prism-eyebrow) { margin:6px 0 0; color:var(--fg-muted); font-size:13px; }
.section-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:16px; }
.section-head > div { min-width:0; }
.section-copy { margin:5px 0 0; color:var(--fg-muted); font-size:12px; line-height:1.45; }
.metric-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:10px; }
.metric-card { --metric-tone:var(--accent-cyan); position:relative; border:1px solid var(--border-muted); border-top:2px solid var(--metric-tone); border-radius:8px; padding:12px 13px; min-height:96px; background:var(--panel); box-shadow:inset 0 1px 0 rgba(255,255,255,.72); cursor:help; transition:background-color .12s ease, border-color .12s ease; }
.metric-card-deploy { --metric-tone:#0891b2; }
.metric-card-lead-time { --metric-tone:#b7791f; }
.metric-card-failure-rate { --metric-tone:#c2413a; }
.metric-card-mttr { --metric-tone:#1f8f5f; }
.metric-card:hover, .metric-card:focus-visible { z-index:3; border-color:var(--tooltip-border); background:var(--panel-subtle); }
.metric-card:focus-visible { outline:2px solid rgba(37,99,235,.28); outline-offset:2px; }
.metric-label { display:block; color:var(--fg-muted); font-size:13px; font-weight:650; }
.metric-card strong { display:block; font-size:28px; line-height:1.08; margin:13px 0 0; letter-spacing:0; color:var(--metric-tone); }
.metric-card-tooltip { position:absolute; left:10px; right:10px; top:calc(100% + 8px); z-index:4; margin:0; padding:10px 12px; border:1px solid var(--tooltip-border); border-radius:10px; background:var(--tooltip-bg); color:var(--fg-default); box-shadow:0 8px 28px rgba(32,39,51,.10); opacity:0; visibility:hidden; transform:translateY(-3px); pointer-events:none; font-size:12px; line-height:1.45; backdrop-filter:blur(8px); transition:opacity .12s ease, transform .12s ease, visibility .12s ease; }
.metric-card:hover .metric-card-tooltip, .metric-card:focus-visible .metric-card-tooltip { opacity:1; visibility:visible; transform:translateY(0); }
.timeline-list { display:grid; gap:10px; }
.timeline-row { display:grid; grid-template-columns:minmax(240px, 340px) minmax(0, 1fr); gap:18px; align-items:center; min-width:0; transition:opacity .14s ease, filter .14s ease; }
.timeline-meta .pr-title, .timeline-meta .pr-ref { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.timeline-meta .pr-title { color:var(--fg-default); text-decoration:none; font-size:13px; font-weight:650; }
.timeline-meta .pr-title:hover { color:var(--accent-blue); text-decoration:underline; }
.timeline-meta .pr-title-line { display:flex; align-items:baseline; gap:5px; min-width:0; }
.timeline-meta .pr-title { min-width:0; }
.timeline-meta .pr-ref { display:block; margin-top:2px; color:var(--fg-subtle); font-size:11px; }
.timeline-meta .pr-author { flex:0 0 auto; white-space:nowrap; color:var(--fg-muted); font-size:11px; cursor:default; }
.timeline-meta .pr-author-prefix { flex:0 0 auto; color:var(--fg-subtle); font-size:11px; }
.timeline-meta .pr-ref[data-repo], .timeline-meta .pr-author[data-author] { cursor:pointer; }
.timeline-meta .pr-ref[data-repo]:hover, .timeline-meta .pr-author[data-author]:hover { color:var(--accent-blue); text-decoration:underline; }
.timeline-list[data-hovered-filter] .timeline-row:not(.timeline-axis-row) { opacity:.28; filter:grayscale(1); }
.timeline-list[data-hovered-filter] .timeline-row.timeline-filter-active { opacity:1; filter:none; }
.timeline-track-wrap { width:100%; }
.timeline-track { position:relative; height:18px; border-radius:999px; background:var(--timeline-rail); overflow:hidden; border:1px solid var(--border-muted); cursor:help; background-image: repeating-linear-gradient(to right, transparent 0, transparent calc(100%/7 - 1px), var(--timeline-grid) calc(100%/7 - 1px), var(--timeline-grid) calc(100%/7)); }
.timeline-axis { display:grid; grid-template-columns:repeat(7, 1fr); padding:0 1px; margin-bottom:7px; }
.timeline-axis span { color:var(--fg-subtle); font-size:11px; text-align:left; }
.timeline-axis span:not(:first-child) { padding-left:5px; border-left:1px solid var(--border-muted); }
.timeline-axis-row { align-items:end; }
.timeline-axis-row .timeline-meta { color:var(--fg-subtle); font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
.timeline-legend { display:flex; flex-wrap:wrap; gap:12px; align-items:center; font-size:12px; color:var(--fg-muted); }
.legend-item { display:inline-flex; align-items:center; gap:6px; }
.legend-swatch { display:inline-block; width:10px; height:10px; border-radius:999px; }
.segment { position:absolute; top:2px; bottom:2px; border-radius:999px; }
.timeline-row[data-closed-unmerged="true"] .timeline-track { background:repeating-linear-gradient(135deg, var(--timeline-rail) 0 6px, rgba(120,120,120,.18) 6px 12px); border-style:dashed; }
.timeline-row[data-closed-unmerged="true"] .segment { filter:grayscale(.85) opacity(.55); }
.timeline-row[data-closed-unmerged="true"] .timeline-track::after { content:"✕"; position:absolute; top:50%; right:4px; transform:translateY(-50%); color:var(--danger); font-size:11px; font-weight:700; line-height:1; pointer-events:none; }
.timeline-row[data-closed-unmerged="true"] .pr-title { color:var(--fg-muted); text-decoration:line-through; text-decoration-thickness:1px; }
.legend-swatch-closed { background:repeating-linear-gradient(135deg, var(--fg-subtle) 0 3px, transparent 3px 6px); border:1px dashed var(--fg-subtle); border-radius:2px; }
.timeline-tooltip { position:fixed; z-index:20; max-width:min(420px, calc(100vw - 20px)); padding:10px 12px; border:1px solid var(--tooltip-border); border-radius:10px; background:var(--tooltip-bg); color:var(--fg-default); box-shadow:0 8px 28px rgba(32,39,51,.10); pointer-events:none; font-size:12px; line-height:1.45; backdrop-filter:blur(8px); }
.timeline-tooltip[hidden] { display:none; }
.timeline-tooltip-title { margin-bottom:6px; color:var(--fg-muted); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
.timeline-tooltip ol { display:grid; gap:5px; margin:0; padding:0; list-style:none; }
.timeline-tooltip li { display:flex; align-items:flex-start; gap:7px; white-space:nowrap; }
.timeline-tooltip-swatch { flex:0 0 auto; width:8px; height:8px; border-radius:999px; margin-top:5px; }
.implementing { background:var(--accent-cyan); } .wait_review { background:var(--attention); } .in_review { background:var(--accent-blue); } .fixing { background:var(--danger); } .wait_merge { background:var(--success); }
.timeline-tooltip dl { display:grid; grid-template-columns:auto 1fr; gap:3px 10px; margin:8px 0 0; padding-top:8px; border-top:1px solid var(--tooltip-border); }
.timeline-tooltip dt { color:var(--fg-muted); font-size:11px; font-weight:600; }
.timeline-tooltip dd { margin:0; font-size:11px; }
.review-correlation { overflow:hidden; }
.review-correlation .bg-root { position:relative; width:100%; overflow-x:auto; padding-bottom:2px; }
.bg-grid { position:relative; display:grid; grid-template-columns:var(--bg-left-w) var(--bg-col-gap) var(--bg-right-w); width:var(--bg-total-w); min-width:640px; height:var(--bg-height); margin:0 auto; }
.bg-authors { grid-column:1; }
.bg-reviewers { grid-column:3; }
.bg-col { display:flex; flex-direction:column; gap:var(--bg-row-gap); padding-top:var(--bg-header-h); }
.bg-col-header { position:absolute; top:0; height:calc(var(--bg-header-h) - 8px); display:flex; flex-direction:column; justify-content:flex-start; gap:2px; border-bottom:1px solid var(--border-default); padding-bottom:6px; width:var(--bg-left-w); }
.bg-reviewers .bg-col-header { left:calc(var(--bg-left-w) + var(--bg-col-gap)); width:var(--bg-right-w); }
.bg-col-header strong { font-size:12px; color:var(--fg-muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
.bg-col-header small { font-size:11px; color:var(--fg-subtle); }
.bg-edges { position:absolute; inset:0; pointer-events:none; width:100%; height:100%; }
.bg-edges line { transition:stroke-width .12s ease, opacity .12s ease; opacity:.42; }
.bg-root:not([data-hovered]) .bg-edges line { opacity:.24; }
.bg-root[data-hovered] .bg-edges line { opacity:.05; }
.bg-root[data-hovered] .bg-edges line.bg-active { opacity:.78; stroke:var(--accent-cyan); stroke-width:calc(var(--w) * 1.65); }
.bg-node { position:relative; height:var(--bg-row-h); display:flex; align-items:center; gap:10px; padding:0 12px; border-radius:10px; border:1px solid var(--border-muted); background:linear-gradient(180deg, var(--panel), var(--panel-subtle)); overflow:hidden; transition:opacity .12s ease, background-color .12s ease, box-shadow .12s ease, border-color .12s ease; }
.bg-node-empty { border-color:transparent; background:transparent; }
.bg-bar { position:absolute; left:0; top:0; bottom:0; width:var(--bar-w); background:var(--role-fill); border-right:1px solid var(--role-line); z-index:0; }
.bg-dot { position:relative; z-index:1; width:10px; height:10px; border-radius:999px; background:var(--role-color); flex:0 0 auto; box-shadow:0 0 0 3px rgba(255,255,255,.72); }
.bg-label { position:relative; z-index:1; font-size:13px; font-weight:650; color:var(--fg-default); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1 1 auto; }
.bg-count { position:relative; z-index:1; font-size:12px; color:var(--fg-muted); flex:0 0 auto; }
.bg-root[data-hovered] .bg-node { opacity:.35; }
.bg-root[data-hovered] .bg-node.bg-active { opacity:1; border-color:var(--accent-cyan); background:#f0fbfd; box-shadow:0 0 0 2px rgba(8,145,178,.10); }
.bg-root[data-hovered] .bg-node.bg-active .bg-bar { background:rgba(8,145,178,.12); border-color:rgba(8,145,178,.24); }
.bg-legend { display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-top:13px; padding:0 2px; font-size:12px; color:var(--fg-muted); }
.bg-legend-item { display:inline-flex; align-items:center; gap:6px; }
.bg-legend-hint { margin-left:auto; }
.ai-markdown ul { margin:8px 0 0; padding-left:22px; }
.ai-markdown p { margin:0 0 10px; }
.ai-markdown h2 { margin-top:0; }
.empty { color:var(--fg-muted); margin:0; }
@media (max-width: 860px) {
  .metric-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); }
  .dev-prism-grid { grid-template-columns:1fr; }
}
@media (max-width: 640px) {
  main { padding:24px 12px 44px; }
  h1 { font-size:28px; }
  .metric-grid { grid-template-columns:1fr; }
  .timeline-row { grid-template-columns:1fr; gap:8px; }
}`;
