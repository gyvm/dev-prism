import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { escapeHtml } from "../renderers/utils.js";
import { REPORT_INDEX_SCHEMA, kpiSummary, scopeSummary, type ReportIndexEntry } from "./report-index.js";

import { queryActivityTrend } from "../analyses/activity-trend/query.js";
import { DWH_ANALYSIS_REGISTRY, type DwhAnalysisId } from "../analyses/dwh-report.js";
import type { DoraMetrics } from "../shared/types.js";
import type { Scope } from "../analyses/scope.js";
import { exploreHref } from "../analyses/scope-url.js";
import { toDateSlug } from "../shared/timezone.js";
import type { DwhQueryRunner } from "../warehouse/query.js";
import { renderReportHtml } from "../pipeline/stages/render.js";
import type { Period } from "../pipeline/period.js";
import type { AnalysisResult } from "../pipeline/types.js";
import { withDwh } from "../warehouse/query.js";

// Step 6: generate a frozen, self-contained report HTML from the DWH for a
// given scope, reusing the existing renderReportHtml (renderers unchanged), and
// maintain the append-only `index.json` list metadata.

// Order matches the existing report layout: DORA, then timeline, then review.
const REPORT_ANALYSES: readonly DwhAnalysisId[] = ["dora-metrics", "pr-timeline", "review-correlation"];

// Index schema, types, and view helpers live in the dependency-free
// report-index.ts (so the Astro gallery can import them without the DWH stack);
// re-exported here for the existing public API.
export { REPORT_INDEX_ENTRY_SCHEMA, REPORT_INDEX_SCHEMA, type ReportIndexEntry } from "./report-index.js";

export type BuildFrozenReportOptions = Readonly<{
  scope: Scope;
  generatedAt: Date;
  title?: string;
  timezone?: string;
  id?: string;
}>;

export type FrozenReport = Readonly<{
  id: string;
  html: string;
  indexEntry: ReportIndexEntry;
}>;

function serializeScope(scope: Scope): ReportIndexEntry["scope"] {
  return {
    from: scope.from ? scope.from.toISOString() : null,
    to: scope.to ? scope.to.toISOString() : null,
    repos: [...scope.repos],
    users: [...scope.users],
    includeBots: scope.includeBots,
    grain: scope.grain,
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "report";
}

// A short, order-insensitive signature of the scope's *filtering* identity
// (NOT the date window) so a recurring definition keeps a stable id across
// dates (series stacking) while reports that differ in repos/users/grain/bots
// get distinct ids instead of silently colliding. Returns null for the default
// "everything" scope so the common id stays clean.
function scopeDiscriminator(scope: Scope): string | null {
  const isDefault =
    scope.repos.length === 0 && scope.users.length === 0 && scope.includeBots && scope.grain === "week";
  if (isDefault) return null;
  const signature = JSON.stringify({
    repos: [...scope.repos].sort(),
    users: [...scope.users].sort(),
    grain: scope.grain,
    includeBots: scope.includeBots,
  });
  return createHash("sha1").update(signature).digest("hex").slice(0, 8);
}

/** Stable, series-friendly id: `<title-slug>-<YYYYMMDD>[-<scope-hash>]`. */
export function deriveReportId(title: string, scope: Scope, timezone: string): string {
  const anchor = scope.from ?? scope.to ?? new Date(0);
  const base = `${slugify(title)}-${toDateSlug(anchor, timezone).replace(/-/g, "")}`;
  const discriminator = scopeDiscriminator(scope);
  return discriminator ? `${base}-${discriminator}` : base;
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

export async function buildFrozenReport(
  runner: DwhQueryRunner,
  options: BuildFrozenReportOptions,
): Promise<FrozenReport> {
  if (options.scope.from === null || options.scope.to === null) {
    throw new Error("buildFrozenReport requires scope.from and scope.to (the report period)");
  }
  const timezone = options.timezone ?? "UTC";
  const title = options.title ?? "PR レポート";
  const id = options.id ?? deriveReportId(title, options.scope, timezone);
  const from = options.scope.from;
  const to = options.scope.to;

  const results: AnalysisResult[] = [];
  for (const analysisId of REPORT_ANALYSES) {
    const entry = DWH_ANALYSIS_REGISTRY[analysisId];
    const data = await entry.query(runner, options.scope);
    results.push({ id: analysisId, format: "json", renderer: entry.renderer, status: "ok", data });
  }

  const dora = (results.find((r) => r.id === "dora-metrics")?.data ?? null) as DoraMetrics | null;
  const trend = await queryActivityTrend(runner, options.scope);
  const prOpened = trend.buckets.reduce((sum, b) => sum + b.prOpened, 0);
  const prMerged = trend.buckets.reduce((sum, b) => sum + b.prMerged, 0);

  const kpi = {
    deploymentFrequency: dora?.deploymentFrequency ?? 0,
    leadTimeForChangesHours: roundOrNull(dora?.leadTimeForChangesHours ?? null),
    prOpened,
    prMerged,
  };

  const highlights = [
    `${prMerged} 件マージ / ${prOpened} 件オープン`,
    kpi.leadTimeForChangesHours === null
      ? "マージ実績なし"
      : `リードタイム中央値 ${kpi.leadTimeForChangesHours}h`,
  ];

  const period: Period = { id, start: from, end: to };
  const reportInput = {
    generatedAt: options.generatedAt.toISOString(),
    timezone,
    week: { start: from.toISOString(), end: to.toISOString() },
    prs: [],
    warnings: [],
  };

  // Footer deep-link carrying this scope into Explore. It is a plain <a> link
  // (no external resource), so single-file shareability is preserved.
  const footer = `<footer class="report-explore-link" style="margin-top:18px;text-align:right;font-size:13px;"><a href="${escapeHtml(exploreHref(options.scope))}">Explore で深掘り →</a></footer>`;
  // App-shell sidebar overlay (method Z): injected at view-time by nav.js so the
  // report body stays frozen while the nav reflects the latest deploy. Relative
  // `../nav.js` resolves to the site root (reports live one level down at
  // <root>/reports/<id>.html). Opened offline as a single file the script 404s
  // harmlessly — the body still renders fully; only the overlay nav is absent.
  const navScript = `<script type="module" src="../nav.js"></script>`;
  const html = renderReportHtml(period, reportInput, results)
    .replace("</main>", `    ${footer}\n  </main>`)
    .replace("</body>", `  ${navScript}\n</body>`);

  return {
    id,
    html,
    indexEntry: {
      id,
      title,
      scope: serializeScope(options.scope),
      generatedAt: reportInput.generatedAt,
      kpi,
      highlights,
      aiCount: 0,
    },
  };
}

async function readIndex(indexPath: string): Promise<ReportIndexEntry[]> {
  try {
    const raw = await readFile(indexPath, "utf8");
    return REPORT_INDEX_SCHEMA.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Upserts an entry by id and rewrites index.json sorted newest-first. */
export async function upsertIndexEntry(indexPath: string, entry: ReportIndexEntry): Promise<void> {
  const entries = (await readIndex(indexPath)).filter((existing) => existing.id !== entry.id);
  entries.push(entry);
  entries.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt) || a.id.localeCompare(b.id));

  const path = resolve(indexPath);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

function renderIndexEntry(entry: ReportIndexEntry): string {
  const kpi = kpiSummary(entry.kpi);
  const highlights = entry.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("");
  return `      <li class="report-card">
        <a class="report-link" href="reports/${escapeHtml(entry.id)}.html">${escapeHtml(entry.title)}</a>
        <div class="report-scope">${escapeHtml(scopeSummary(entry.scope))}</div>
        <div class="report-kpi">${escapeHtml(kpi)}</div>
        ${highlights ? `<ul class="report-highlights">${highlights}</ul>` : ""}
        <time datetime="${escapeHtml(entry.generatedAt)}">${escapeHtml(entry.generatedAt.slice(0, 10))}</time>
      </li>`;
}

/** Renders the reports list page from index.json metadata (no filesystem scan). */
export function renderIndexHtml(entries: readonly ReportIndexEntry[]): string {
  const items = entries.map(renderIndexEntry).join("\n");
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PR レポート一覧</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 820px; margin: 40px auto; padding: 0 20px; color: #172026; }
    h1 { font-size: 24px; }
    ul { list-style: none; padding: 0; }
    .report-card { padding: 14px 0; border-bottom: 1px solid #e5e7eb; }
    .report-link { color: #246bfe; text-decoration: none; font-size: 17px; font-weight: 650; }
    .report-link:hover { text-decoration: underline; }
    .report-scope, .report-kpi { color: #586574; font-size: 13px; margin-top: 3px; }
    .report-highlights { margin: 6px 0 0; padding-left: 18px; color: #3a4452; font-size: 13px; }
    time { display: block; margin-top: 4px; color: #8a94a3; font-size: 12px; }
    .empty { color: #64707d; }
  </style>
</head>
<body>
  <h1>PR レポート一覧</h1>
  ${entries.length === 0 ? '<p class="empty">レポートはまだありません。</p>' : `<ul>\n${items}\n  </ul>`}
</body>
</html>
`;
}

/** Reads index.json and writes the list page HTML to `outputPath`. */
export async function buildIndexHtmlFromIndex(indexPath: string, outputPath: string): Promise<void> {
  const entries = await readIndex(indexPath);
  const out = resolve(outputPath);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, renderIndexHtml(entries), "utf8");
}

/** Builds the frozen report, writes `<reportsDir>/<id>.html`, and updates index.json. */
export async function writeFrozenReport(
  runner: DwhQueryRunner,
  options: BuildFrozenReportOptions,
  paths: Readonly<{ reportsDir: string; indexPath?: string }>,
): Promise<Readonly<{ id: string; htmlPath: string }>> {
  const report = await buildFrozenReport(runner, options);
  const reportsDir = resolve(paths.reportsDir);
  const htmlPath = join(reportsDir, `${report.id}.html`);
  await mkdir(reportsDir, { recursive: true });
  await writeFile(htmlPath, report.html, "utf8");
  await upsertIndexEntry(paths.indexPath ?? join(reportsDir, "index.json"), report.indexEntry);
  return { id: report.id, htmlPath };
}

export type ReportTask = Readonly<{ scope: Scope; title: string }>;

/**
 * Opens the DWH once, generates each report task into `reportsDir`, then
 * rebuilds the list page from index.json. The single source of truth for the
 * list is index.json (no filesystem scan).
 */
export async function generateReports(options: Readonly<{
  dwhDir: string;
  reportsDir: string;
  indexHtmlPath?: string;
  tasks: readonly ReportTask[];
  generatedAt: Date;
  timezone?: string;
}>): Promise<Readonly<{ ids: string[] }>> {
  const reportsDir = resolve(options.reportsDir);
  const indexPath = join(reportsDir, "index.json");
  const ids: string[] = [];

  await withDwh(options.dwhDir, async (runner) => {
    for (const task of options.tasks) {
      const written = await writeFrozenReport(
        runner,
        {
          scope: task.scope,
          title: task.title,
          generatedAt: options.generatedAt,
          ...(options.timezone ? { timezone: options.timezone } : {}),
        },
        { reportsDir, indexPath },
      );
      ids.push(written.id);
    }
  });

  if (options.indexHtmlPath) {
    await buildIndexHtmlFromIndex(indexPath, options.indexHtmlPath);
  }
  return { ids };
}
