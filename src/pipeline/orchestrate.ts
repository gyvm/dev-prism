import { join, resolve } from "node:path";

import { loadUnifiedConfig } from "../shared/config.js";
import { buildReportInput } from "../report/projection.js";
import { readJsonl } from "../jsonl/reader.js";
import { writeJsonl } from "../jsonl/writer.js";
import type { AnalysisLine } from "../jsonl/types.js";
import { periodForDate, type Period } from "./period.js";
import { fetchStage, type FetchResult } from "./stages/fetch.js";
import {
  analyzeStage,
  discoverAiSkillIds,
  type AnalyzeResult,
} from "./stages/analyze.js";
import {
  appendReportManifest,
  renderStage,
  writeIndexShell,
  type RenderResult,
} from "./stages/render.js";
import {
  createCopilotSdkRunner,
  validateAiModel,
  type AiRunner,
} from "./ai-runner.js";
import type { AnalysisResult, RendererId } from "./types.js";

export type OrchestrateOptions = Readonly<{
  configPath?: string;
  now?: Date;
  skipAi?: boolean;
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
  aiRunner?: AiRunner;
  dataDir?: string;
  reportsDir?: string;
  indexHtmlPath?: string;
  skillsRoot?: string;
  fromJsonlPath?: string;
}>;

export type OrchestrateResult = Readonly<{
  period: Period;
  fetch: FetchResult;
  analyze: AnalyzeResult;
  render: RenderResult;
  jsonlPath: string;
  indexHtmlPath: string;
  manifestPath: string;
}>;

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

export async function orchestrate(
  options: OrchestrateOptions = {},
): Promise<OrchestrateResult> {
  const now = options.now ?? new Date();
  const config = await loadUnifiedConfig(options.configPath ?? "config.toml");
  const dataDir = options.dataDir ?? "data";

  let period: Period;
  let fetchResult: FetchResult;
  let analyzeResult: AnalyzeResult;
  let jsonlPath: string;

  if (options.fromJsonlPath) {
    if (options.now) {
      process.stderr.write(
        "warning: --week is ignored when --from-jsonl is set; period is taken from the JSONL\n",
      );
    }
    jsonlPath = resolve(options.fromJsonlPath);
    const bundle = await readJsonl(jsonlPath);
    period = {
      id: bundle.meta.week,
      start: new Date(bundle.meta.weekStart),
      end: new Date(bundle.meta.weekEnd),
    };
    fetchResult = { period, pullRequests: bundle.pullRequests };
    const reportInput = buildReportInput({
      pullRequests: bundle.pullRequests,
      generatedAt: new Date(bundle.meta.generatedAt),
      timezone: bundle.meta.timezone,
      weekStart: period.start,
      weekEnd: period.end,
      limits: config.limits,
    });
    const results = bundle.analyses.map(analysisLineToResult);
    analyzeResult = { period, results, reportInput };
  } else {
    period = periodForDate(now, config.timezone);
    fetchResult = await fetchStage(period, {
      ...(options.configPath ? { configPath: options.configPath } : {}),
      ...(options.env ? { env: options.env } : {}),
      ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
      now,
    });

    const env = options.env ?? process.env;
    const copilotToken = env.COPILOT_GITHUB_TOKEN?.trim();
    const skillsRoot = options.skillsRoot ?? "skills";
    let aiRunner = options.aiRunner;
    if (!aiRunner && !options.skipAi) {
      const aiSkillIds = await discoverAiSkillIds(skillsRoot);
      if (aiSkillIds.length > 0) {
        const skillDirectories = aiSkillIds.map((id) =>
          resolve(skillsRoot, id),
        );
        if (config.ai.model) {
          await validateAiModel({
            model: config.ai.model,
            ...(copilotToken ? { gitHubToken: copilotToken } : {}),
          });
        }
        aiRunner = createCopilotSdkRunner({
          skillDirectories,
          ...(config.ai.model ? { model: config.ai.model } : {}),
          ...(copilotToken ? { gitHubToken: copilotToken } : {}),
        });
      }
    }

    analyzeResult = await analyzeStage(period, fetchResult.pullRequests, {
      limits: config.limits,
      timezone: config.timezone,
      now,
      bots: config.bots,
      ...(options.skipAi ? { skipAi: true } : {}),
      ...(aiRunner ? { aiRunner } : {}),
      skillsRoot,
    });

    jsonlPath = resolve(dataDir, `${period.id}.jsonl`);
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
  }

  const reportsDir = options.reportsDir ?? join("dist", "reports");
  const renderResult = await renderStage(
    period,
    analyzeResult.reportInput,
    analyzeResult.results,
    {
      reportInput: analyzeResult.reportInput,
      outputPath: join(reportsDir, `${period.id}.html`),
    },
  );

  const indexHtmlPath = options.indexHtmlPath ?? join("dist", "index.html");
  await writeIndexShell(indexHtmlPath);

  const manifestPath = await appendReportManifest(reportsDir, {
    period: period.id,
    path: `${period.id}.html`,
    generatedAt: now.toISOString(),
    prCount: fetchResult.pullRequests.length,
  });

  return {
    period,
    fetch: fetchResult,
    analyze: analyzeResult,
    render: renderResult,
    jsonlPath,
    indexHtmlPath,
    manifestPath,
  };
}
