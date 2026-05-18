import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { loadUnifiedConfig } from "../shared/config.js";
import { buildReportInput } from "../report/projection.js";
import { readJsonl } from "../jsonl/reader.js";
import { upsertAnalysisLine, writeJsonl } from "../jsonl/writer.js";
import {
  ANALYSIS_LINE_TYPE,
  type AnalysisLine,
} from "../jsonl/types.js";
import { periodForDate, type Period } from "../pipeline/period.js";
import { fetchStage } from "../pipeline/stages/fetch.js";
import {
  analyzeStage,
  discoverAiSkillIds,
} from "../pipeline/stages/analyze.js";
import {
  appendReportManifest,
  renderStage,
  writeIndexShell,
} from "../pipeline/stages/render.js";
import type { AnalysisResult, RendererId } from "../pipeline/types.js";

export type SubcommandOptions = {
  configPath?: string;
  dataDir?: string;
  reportsDir?: string;
  indexHtmlPath?: string;
  skillsRoot?: string;
  fromJsonlPath?: string;
  now?: Date;
  skill?: string;
  markdownPath?: string;
};

function defaultDataDir(opts: SubcommandOptions): string {
  return opts.dataDir ?? "data";
}

function defaultReportsDir(opts: SubcommandOptions): string {
  return opts.reportsDir ?? join("dist", "reports");
}

function defaultSkillsRoot(opts: SubcommandOptions): string {
  return opts.skillsRoot ?? "skills";
}

async function resolveJsonlPath(
  opts: SubcommandOptions,
  period: Period | undefined,
): Promise<string> {
  if (opts.fromJsonlPath) return resolve(opts.fromJsonlPath);
  if (!period) throw new Error("--from-jsonl or --week is required");
  return resolve(defaultDataDir(opts), `${period.id}.jsonl`);
}

async function resolvePeriodFromOptions(
  opts: SubcommandOptions,
): Promise<Period> {
  const config = await loadUnifiedConfig(opts.configPath ?? "config.toml");
  return periodForDate(opts.now ?? new Date(), config.timezone);
}

export async function fetchCommand(opts: SubcommandOptions): Promise<void> {
  const now = opts.now ?? new Date();
  const config = await loadUnifiedConfig(opts.configPath ?? "config.toml");
  const period = periodForDate(now, config.timezone);
  const fetchResult = await fetchStage(period, {
    ...(opts.configPath ? { configPath: opts.configPath } : {}),
    now,
  });

  const analyzeResult = await analyzeStage(period, fetchResult.pullRequests, {
    limits: config.limits,
    timezone: config.timezone,
    now,
    bots: config.bots,
    skipAi: true,
    skillsRoot: defaultSkillsRoot(opts),
  });

  const jsonlPath = resolve(
    defaultDataDir(opts),
    `${period.id}.jsonl`,
  );
  await writeJsonl(jsonlPath, {
    meta: {
      week: period.id,
      weekStart: period.start.toISOString(),
      weekEnd: period.end.toISOString(),
      generatedAt: now.toISOString(),
      timezone: config.timezone,
    },
    pullRequests: fetchResult.pullRequests,
    analyses: analyzeResult.results.map((result) => ({
      result,
      kind: result.format === "markdown" ? "ai" : "compute",
    })),
  });

  process.stdout.write(`${jsonlPath}\n`);
}

export async function listSkillsCommand(
  opts: SubcommandOptions,
): Promise<void> {
  const ids = await discoverAiSkillIds(defaultSkillsRoot(opts));
  for (const id of ids) process.stdout.write(`${id}\n`);
}

export async function analyzeCommand(opts: SubcommandOptions): Promise<void> {
  if (!opts.skill) throw new Error("analyze requires --skill <id>");
  const period = opts.fromJsonlPath
    ? undefined
    : await resolvePeriodFromOptions(opts);
  const jsonlPath = await resolveJsonlPath(opts, period);
  const bundle = await readJsonl(jsonlPath);
  const config = await loadUnifiedConfig(opts.configPath ?? "config.toml");

  const reportInput = buildReportInput({
    pullRequests: bundle.pullRequests,
    generatedAt: new Date(bundle.meta.generatedAt),
    timezone: bundle.meta.timezone,
    weekStart: new Date(bundle.meta.weekStart),
    weekEnd: new Date(bundle.meta.weekEnd),
    limits: config.limits,
  });

  const payload = {
    section: { id: opts.skill },
    week: reportInput.week,
    prs: reportInput.prs,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function readMarkdownInput(source: string): Promise<string> {
  if (source === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString("utf-8");
  }
  return readFile(source, "utf-8");
}

function stripCodeFence(output: string): string {
  const trimmed = output.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

export async function analyzeWriteCommand(
  opts: SubcommandOptions,
): Promise<void> {
  if (!opts.skill) throw new Error("analyze-write requires --skill <id>");
  if (!opts.markdownPath)
    throw new Error("analyze-write requires --markdown <path|->");
  const period = opts.fromJsonlPath
    ? undefined
    : await resolvePeriodFromOptions(opts);
  const jsonlPath = await resolveJsonlPath(opts, period);
  const rawMarkdown = await readMarkdownInput(opts.markdownPath);
  const markdown = stripCodeFence(rawMarkdown);
  if (!markdown) throw new Error("markdown input is empty");

  const line: AnalysisLine = {
    type: ANALYSIS_LINE_TYPE,
    section: opts.skill,
    kind: "ai",
    status: "ok",
    format: "markdown",
    markdown,
  };
  await upsertAnalysisLine(jsonlPath, opts.skill, line);
  process.stdout.write(`updated: ${jsonlPath} (${opts.skill})\n`);
}

const KNOWN_RENDERERS: ReadonlySet<RendererId> = new Set([
  "metric-cards",
  "gantt-chart",
  "bipartite-graph",
]);

function analysisLineToResult(line: AnalysisLine): AnalysisResult {
  const renderer =
    line.renderer && KNOWN_RENDERERS.has(line.renderer as RendererId)
      ? (line.renderer as RendererId)
      : undefined;
  const data = line.format === "markdown" ? line.markdown : line.data;
  return {
    id: line.section,
    format: line.format,
    status: line.status,
    ...(renderer ? { renderer } : {}),
    ...(data !== undefined ? { data } : {}),
    ...(line.reason ? { reason: line.reason } : {}),
    ...(line.stack ? { stack: line.stack } : {}),
  };
}

export async function renderCommand(opts: SubcommandOptions): Promise<void> {
  const config = await loadUnifiedConfig(opts.configPath ?? "config.toml");
  const period = opts.fromJsonlPath
    ? undefined
    : periodForDate(opts.now ?? new Date(), config.timezone);
  const jsonlPath = await resolveJsonlPath(opts, period);
  const bundle = await readJsonl(jsonlPath);

  const periodFromBundle: Period = {
    id: bundle.meta.week,
    start: new Date(bundle.meta.weekStart),
    end: new Date(bundle.meta.weekEnd),
  };

  const reportInput = buildReportInput({
    pullRequests: bundle.pullRequests,
    generatedAt: new Date(bundle.meta.generatedAt),
    timezone: bundle.meta.timezone,
    weekStart: periodFromBundle.start,
    weekEnd: periodFromBundle.end,
    limits: config.limits,
  });

  const results = bundle.analyses.map(analysisLineToResult);
  const reportsDir = defaultReportsDir(opts);
  const renderResult = await renderStage(
    periodFromBundle,
    reportInput,
    results,
    {
      reportInput,
      outputPath: join(reportsDir, `${periodFromBundle.id}.html`),
    },
  );

  const jsonlPublicPath = resolve(
    reportsDir,
    `${periodFromBundle.id}.jsonl`,
  );
  await mkdir(dirname(jsonlPublicPath), { recursive: true });
  await copyFile(jsonlPath, jsonlPublicPath);

  const indexHtmlPath = opts.indexHtmlPath ?? join("dist", "index.html");
  await writeIndexShell(indexHtmlPath);

  const manifestPath = await appendReportManifest(reportsDir, {
    period: periodFromBundle.id,
    path: `${periodFromBundle.id}.html`,
    generatedAt: bundle.meta.generatedAt,
    prCount: bundle.pullRequests.length,
    jsonl: `${periodFromBundle.id}.jsonl`,
  });

  process.stdout.write(`Written: ${renderResult.htmlPath}\n`);
  process.stdout.write(`Written: ${jsonlPublicPath}\n`);
  process.stdout.write(`Written: ${manifestPath}\n`);
  process.stdout.write(`Written: ${indexHtmlPath}\n`);
}
