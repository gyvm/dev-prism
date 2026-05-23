import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  DEFAULT_BOTS,
  DEFAULT_LIMITS,
  parseRepositoriesArg,
  resolveTimezone,
  type UnifiedConfig,
} from "../shared/config.js";
import { inferRepositoryFromGit } from "../shared/git-remote.js";
import { ConfigError } from "../shared/errors.js";
import { buildReportInput } from "../report/projection.js";
import type { ReportInput } from "../report/types.js";
import { readJsonl } from "../jsonl/reader.js";
import { upsertAnalysisLine, writeJsonl } from "../jsonl/writer.js";
import { ANALYSIS_LINE_TYPE } from "../jsonl/types.js";
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
import {
  createCopilotSdkRunner,
  validateAiModel,
  type AiRunner,
} from "../pipeline/ai-runner.js";
import type { AnalysisResult } from "../pipeline/types.js";
import type { NormalizedPullRequest, RepositorySpec } from "../shared/types.js";

export type SubcommandOptions = {
  dataDir?: string;
  reportsDir?: string;
  indexHtmlPath?: string;
  skillsRoot?: string;
  fromJsonlPath?: string;
  now?: Date;
  skill?: string;
  writePath?: string;
  skipAi?: boolean;
  repositories?: string;
  timezone?: string;
  model?: string;
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
  aiRunner?: AiRunner;
};

const defaults = {
  dataDir: (o: SubcommandOptions) => o.dataDir ?? "data",
  reportsDir: (o: SubcommandOptions) => o.reportsDir ?? join("dist", "reports"),
  skillsRoot: (o: SubcommandOptions) => o.skillsRoot ?? "skills",
  indexHtmlPath: (o: SubcommandOptions) =>
    o.indexHtmlPath ?? join("dist", "index.html"),
};

function specLabel(spec: RepositorySpec): string {
  return spec.kind === "wildcard"
    ? `${spec.owner}/*`
    : `${spec.owner}/${spec.name}`;
}

/**
 * Resolve target repositories: explicit `--repositories` wins, otherwise infer
 * the current repo from the git origin remote, otherwise fail.
 */
async function resolveRepositories(
  opts: SubcommandOptions,
): Promise<readonly RepositorySpec[]> {
  if (opts.repositories?.trim()) {
    return parseRepositoriesArg(opts.repositories);
  }
  const inferred = await inferRepositoryFromGit();
  if (inferred) {
    process.stderr.write(
      `[config] --repositories not given; inferred "${specLabel(inferred)}" from git remote\n`,
    );
    return [inferred];
  }
  throw new ConfigError(
    'No repositories specified. Pass --repositories "owner/name" (comma/space separated, "owner/*" allowed), or run inside a GitHub repository.',
  );
}

function buildConfig(
  repositories: readonly RepositorySpec[],
  opts: SubcommandOptions,
): UnifiedConfig {
  const model = opts.model?.trim();
  return {
    timezone: resolveTimezone(opts.timezone),
    repositories,
    limits: DEFAULT_LIMITS,
    ai: model ? { model } : {},
    bots: DEFAULT_BOTS,
  };
}

function jsonlPathFor(opts: SubcommandOptions, period: Period): string {
  return opts.fromJsonlPath
    ? resolve(opts.fromJsonlPath)
    : resolve(defaults.dataDir(opts), `${period.id}.jsonl`);
}

async function resolvePeriod(
  opts: SubcommandOptions,
  timezone: string,
): Promise<Period> {
  if (opts.fromJsonlPath) {
    const bundle = await readJsonl(resolve(opts.fromJsonlPath));
    return {
      id: bundle.meta.week,
      start: new Date(bundle.meta.weekStart),
      end: new Date(bundle.meta.weekEnd),
    };
  }
  return periodForDate(opts.now ?? new Date(), timezone);
}

type FetchAndWriteResult = {
  jsonlPath: string;
  period: Period;
  pullRequests: readonly NormalizedPullRequest[];
  results: readonly AnalysisResult[];
  reportInput: ReportInput;
  generatedAt: Date;
};

async function fetchAndWrite(
  opts: SubcommandOptions,
  config: UnifiedConfig,
  aiRunner?: AiRunner,
): Promise<FetchAndWriteResult> {
  const now = opts.now ?? new Date();
  const period = periodForDate(now, config.timezone);
  const fetchResult = await fetchStage(period, {
    repositories: config.repositories,
    ...(opts.env ? { env: opts.env } : {}),
    ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {}),
    now,
  });

  const analyzeResult = await analyzeStage(period, fetchResult.pullRequests, {
    limits: config.limits,
    timezone: config.timezone,
    now,
    bots: config.bots,
    skillsRoot: defaults.skillsRoot(opts),
    ...(aiRunner ? { aiRunner } : { skipAi: true }),
  });

  const jsonlPath = resolve(defaults.dataDir(opts), `${period.id}.jsonl`);
  await writeJsonl(jsonlPath, {
    meta: {
      week: period.id,
      weekStart: period.start.toISOString(),
      weekEnd: period.end.toISOString(),
      generatedAt: now.toISOString(),
      timezone: config.timezone,
    },
    pullRequests: fetchResult.pullRequests,
    analyses: analyzeResult.results,
  });

  return {
    jsonlPath,
    period,
    pullRequests: fetchResult.pullRequests,
    results: analyzeResult.results,
    reportInput: analyzeResult.reportInput,
    generatedAt: now,
  };
}

type PublishResult = {
  htmlPath: string;
  jsonlPublicPath: string;
  manifestPath: string;
  indexHtmlPath: string;
};

async function publish(
  opts: SubcommandOptions,
  period: Period,
  reportInput: ReportInput,
  results: readonly AnalysisResult[],
  jsonlPath: string,
  generatedAt: string,
  prCount: number,
): Promise<PublishResult> {
  const reportsDir = defaults.reportsDir(opts);
  const { htmlPath } = await renderStage(period, reportInput, results, {
    reportInput,
    outputPath: join(reportsDir, `${period.id}.html`),
  });

  const jsonlPublicPath = resolve(reportsDir, `${period.id}.jsonl`);
  await mkdir(dirname(jsonlPublicPath), { recursive: true });
  await copyFile(jsonlPath, jsonlPublicPath);

  const indexHtmlPath = defaults.indexHtmlPath(opts);
  await writeIndexShell(indexHtmlPath);

  const manifestPath = await appendReportManifest(reportsDir, {
    period: period.id,
    path: `${period.id}.html`,
    generatedAt,
    prCount,
    jsonl: `${period.id}.jsonl`,
  });

  return { htmlPath, jsonlPublicPath, manifestPath, indexHtmlPath };
}

async function createAiRunnerIfConfigured(
  opts: SubcommandOptions,
  config: UnifiedConfig,
): Promise<AiRunner | undefined> {
  if (opts.aiRunner) return opts.aiRunner;
  if (opts.skipAi) return undefined;
  const env = opts.env ?? process.env;
  const copilotToken = env.COPILOT_GITHUB_TOKEN?.trim();
  const skillsRoot = defaults.skillsRoot(opts);
  const aiSkillIds = await discoverAiSkillIds(skillsRoot);
  if (aiSkillIds.length === 0) return undefined;
  if (config.ai.model) {
    await validateAiModel({
      model: config.ai.model,
      ...(copilotToken ? { gitHubToken: copilotToken } : {}),
    });
  }
  return createCopilotSdkRunner({
    skillDirectories: aiSkillIds.map((id) => resolve(skillsRoot, id)),
    ...(config.ai.model ? { model: config.ai.model } : {}),
    ...(copilotToken ? { gitHubToken: copilotToken } : {}),
  });
}

export type RunResult = {
  period: Period;
  results: readonly AnalysisResult[];
} & PublishResult & { jsonlPath: string };

export async function runCommand(opts: SubcommandOptions): Promise<RunResult> {
  const repositories = await resolveRepositories(opts);
  const config = buildConfig(repositories, opts);
  const aiRunner = await createAiRunnerIfConfigured(opts, config);
  const result = await fetchAndWrite(opts, config, aiRunner);
  const published = await publish(
    opts,
    result.period,
    result.reportInput,
    result.results,
    result.jsonlPath,
    result.generatedAt.toISOString(),
    result.pullRequests.length,
  );
  return {
    period: result.period,
    results: result.results,
    jsonlPath: result.jsonlPath,
    ...published,
  };
}

export async function fetchCommand(opts: SubcommandOptions): Promise<void> {
  const repositories = await resolveRepositories(opts);
  const config = buildConfig(repositories, opts);
  const result = await fetchAndWrite(opts, config);
  process.stdout.write(`${result.jsonlPath}\n`);
}

export async function listSkillsCommand(
  opts: SubcommandOptions,
): Promise<void> {
  const ids = await discoverAiSkillIds(defaults.skillsRoot(opts));
  for (const id of ids) process.stdout.write(`${id}\n`);
}

function stripCodeFence(output: string): string {
  const trimmed = output.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);
  return (fenced?.[1] ?? trimmed).trim();
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

export async function analyzeCommand(opts: SubcommandOptions): Promise<void> {
  if (!opts.skill) throw new Error("analyze requires --skill <id>");
  const period = await resolvePeriod(opts, resolveTimezone(opts.timezone));
  const jsonlPath = jsonlPathFor(opts, period);
  const bundle = await readJsonl(jsonlPath);

  if (opts.writePath) {
    const rawMarkdown = await readMarkdownInput(opts.writePath);
    const markdown = stripCodeFence(rawMarkdown);
    if (!markdown) throw new Error("markdown input is empty");
    await upsertAnalysisLine(jsonlPath, {
      type: ANALYSIS_LINE_TYPE,
      id: opts.skill,
      status: "ok",
      format: "markdown",
      data: markdown,
    });
    process.stdout.write(`updated: ${jsonlPath} (${opts.skill})\n`);
    return;
  }

  const reportInput = buildReportInput({
    pullRequests: bundle.pullRequests,
    generatedAt: new Date(bundle.meta.generatedAt),
    timezone: bundle.meta.timezone,
    weekStart: new Date(bundle.meta.weekStart),
    weekEnd: new Date(bundle.meta.weekEnd),
    limits: DEFAULT_LIMITS,
  });

  const payload = {
    section: { id: opts.skill },
    week: reportInput.week,
    prs: reportInput.prs,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export async function renderCommand(opts: SubcommandOptions): Promise<void> {
  const period = await resolvePeriod(opts, resolveTimezone(opts.timezone));
  const jsonlPath = jsonlPathFor(opts, period);
  const bundle = await readJsonl(jsonlPath);

  const reportInput = buildReportInput({
    pullRequests: bundle.pullRequests,
    generatedAt: new Date(bundle.meta.generatedAt),
    timezone: bundle.meta.timezone,
    weekStart: period.start,
    weekEnd: period.end,
    limits: DEFAULT_LIMITS,
  });

  const published = await publish(
    opts,
    period,
    reportInput,
    bundle.analyses,
    jsonlPath,
    bundle.meta.generatedAt,
    bundle.pullRequests.length,
  );

  process.stdout.write(`Written: ${published.htmlPath}\n`);
  process.stdout.write(`Written: ${published.jsonlPublicPath}\n`);
  process.stdout.write(`Written: ${published.manifestPath}\n`);
  process.stdout.write(`Written: ${published.indexHtmlPath}\n`);
}
