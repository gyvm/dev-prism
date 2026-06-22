import { join, resolve } from "node:path";

import { loadUnifiedConfig } from "../shared/config.js";
import { periodForDate, type Period } from "./period.js";
import {
  fetchStage,
  readRawSnapshot,
  type FetchResult,
} from "./stages/fetch.js";
import {
  analyzeStage,
  type AnalyzeResult,
} from "./stages/analyze.js";
import {
  buildIndexHtml,
  renderStage,
  type RenderResult,
} from "./stages/render.js";
import {
  createCopilotSdkRunner,
  validateAiModel,
  type AiRunner,
} from "./ai-runner.js";

export type OrchestrateOptions = Readonly<{
  configPath?: string;
  now?: Date;
  skipAi?: boolean;
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
  aiRunner?: AiRunner;
  rawDir?: string;
  analysisDir?: string;
  reportsDir?: string;
  indexHtmlPath?: string;
  useRawPath?: string;
}>;

export type OrchestrateResult = Readonly<{
  period: Period;
  fetch: FetchResult;
  analyze: AnalyzeResult;
  render: RenderResult;
  indexHtmlPath: string;
}>;

export async function orchestrate(
  options: OrchestrateOptions = {},
): Promise<OrchestrateResult> {
  const now = options.now ?? new Date();
  const config = await loadUnifiedConfig(options.configPath ?? "config.toml");

  let period: Period;
  let fetchResult: FetchResult;
  if (options.useRawPath) {
    if (options.now) {
      process.stderr.write(
        "warning: --week is ignored when --use-raw is set; period is taken from the snapshot\n",
      );
    }
    const rawPath = resolve(options.useRawPath);
    const snapshot = await readRawSnapshot(rawPath);
    period = {
      id: snapshot.period.id,
      start: new Date(snapshot.period.start),
      end: new Date(snapshot.period.end),
    };
    fetchResult = {
      period,
      pullRequests: snapshot.pullRequests,
      rawPath,
      errors: [],
    };
  } else {
    period = periodForDate(now, config.timezone);
    fetchResult = await fetchStage(period, {
      ...(options.configPath ? { configPath: options.configPath } : {}),
      ...(options.env ? { env: options.env } : {}),
      ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
      ...(options.rawDir ? { outputRoot: options.rawDir } : {}),
      now,
    });
  }

  const env = options.env ?? process.env;
  const copilotToken = env.COPILOT_GITHUB_TOKEN?.trim();
  let aiRunner = options.aiRunner;
  if (!aiRunner && !options.skipAi) {
    if (config.ai.model) {
      await validateAiModel({
        model: config.ai.model,
        ...(copilotToken ? { gitHubToken: copilotToken } : {}),
      });
    }
    aiRunner = createCopilotSdkRunner({
      ...(config.ai.model ? { model: config.ai.model } : {}),
      ...(copilotToken ? { gitHubToken: copilotToken } : {}),
    });
  }

  const analyzeResult = await analyzeStage(
    period,
    fetchResult.pullRequests,
    {
      limits: config.limits,
      timezone: config.timezone,
      now,
      bots: config.bots,
      ...(options.skipAi ? { skipAi: true } : {}),
      ...(aiRunner ? { aiRunner } : {}),
      ...(options.analysisDir ? { outputRoot: options.analysisDir } : {}),
    },
  );

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
  await buildIndexHtml(reportsDir, indexHtmlPath);

  return {
    period,
    fetch: fetchResult,
    analyze: analyzeResult,
    render: renderResult,
    indexHtmlPath,
  };
}
