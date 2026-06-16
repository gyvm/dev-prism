import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { z } from "zod";

import { queryActivityTrend } from "../analyses/activity-trend/query.js";
import { DWH_ANALYSIS_REGISTRY, type DwhAnalysisId } from "../analyses/dwh-report.js";
import type { DoraMetrics } from "../shared/types.js";
import type { Scope } from "../analyses/scope.js";
import { toDateSlug } from "../shared/timezone.js";
import type { DwhQueryRunner } from "../warehouse/query.js";
import { renderReportHtml } from "../pipeline/stages/render.js";
import type { Period } from "../pipeline/period.js";
import type { AnalysisResult } from "../pipeline/types.js";

// Step 6: generate a frozen, self-contained report HTML from the DWH for a
// given scope, reusing the existing renderReportHtml (renderers unchanged), and
// maintain the append-only `index.json` list metadata.

// Order matches the existing report layout: DORA, then timeline, then review.
const REPORT_ANALYSES: readonly DwhAnalysisId[] = ["dora-metrics", "pr-timeline", "review-correlation"];

const KPI_SCHEMA = z.object({
  deploymentFrequency: z.number(),
  leadTimeForChangesHours: z.number().nullable(),
  prOpened: z.number(),
  prMerged: z.number(),
});

const SERIALIZED_SCOPE_SCHEMA = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  repos: z.array(z.string()),
  users: z.array(z.string()),
  includeBots: z.boolean(),
  grain: z.enum(["day", "week", "month"]),
});

export const REPORT_INDEX_ENTRY_SCHEMA = z.object({
  id: z.string(),
  title: z.string(),
  scope: SERIALIZED_SCOPE_SCHEMA,
  generatedAt: z.string(),
  kpi: KPI_SCHEMA,
  highlights: z.array(z.string()),
  aiCount: z.number(),
});

export const REPORT_INDEX_SCHEMA = z.array(REPORT_INDEX_ENTRY_SCHEMA);

export type ReportIndexEntry = z.infer<typeof REPORT_INDEX_ENTRY_SCHEMA>;

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

function serializeScope(scope: Scope): z.infer<typeof SERIALIZED_SCOPE_SCHEMA> {
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

/** Stable, series-friendly id: `<title-slug>-<YYYYMMDD>` from the scope start. */
export function deriveReportId(title: string, scope: Scope, timezone: string): string {
  const anchor = scope.from ?? scope.to ?? new Date(0);
  return `${slugify(title)}-${toDateSlug(anchor, timezone).replace(/-/g, "")}`;
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

export async function buildFrozenReport(
  runner: DwhQueryRunner,
  options: BuildFrozenReportOptions,
): Promise<FrozenReport> {
  if (options.scope.to === null) {
    throw new Error("buildFrozenReport requires scope.to (report period end)");
  }
  const timezone = options.timezone ?? "UTC";
  const title = options.title ?? "PR レポート";
  const id = options.id ?? deriveReportId(title, options.scope, timezone);
  const from = options.scope.from ?? options.scope.to;
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

  const html = renderReportHtml(period, reportInput, results);

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
