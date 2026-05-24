import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import type { BotsConfig, LimitsConfig } from "../../shared/config.js";
import { createBotLoginMatcher } from "../../shared/bot.js";
import type { NormalizedPullRequest } from "../../shared/types.js";
import { buildReportInput } from "../../report/projection.js";
import type { ReportInput } from "../../report/types.js";
import type { Period } from "../period.js";
import { errored, noData, ok, runWithFailure, skipped } from "../failure.js";
import type { AnalysisDescriptor, AnalysisResult } from "../types.js";
import type { AiRunner } from "../ai-runner.js";

import type { AnalysisContext } from "../../analyses/context.js";
import { COMPUTE_REGISTRY, type ComputeEntry } from "../../analyses/registry.js";

export type AnalyzeOptions = Readonly<{
  limits: LimitsConfig;
  timezone: string;
  now: Date;
  skipAi?: boolean;
  aiRunner?: AiRunner;
  skillsRoot?: string;
  bots?: BotsConfig;
}>;

export type AnalyzeResult = Readonly<{
  period: Period;
  results: readonly AnalysisResult[];
  reportInput: ReportInput;
}>;

async function readSkillOrder(skillMdPath: string): Promise<number> {
  try {
    const content = await readFile(skillMdPath, "utf8");
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return Number.POSITIVE_INFINITY;
    const orderLine = match[1]?.match(/^\s*order\s*:\s*(\d+)\s*$/m);
    return orderLine ? Number(orderLine[1]) : Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export async function discoverAiSkillIds(
  skillsRoot: string,
): Promise<string[]> {
  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true });
  } catch (error) {
    console.warn(
      `[analyze] skillsRoot "${skillsRoot}" not readable; AI skills will be skipped (${(error as Error).message})`,
    );
    return [];
  }
  const found: { id: string; order: number }[] = [];
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const skillMd = join(skillsRoot, entry.name, "SKILL.md");
        try {
          const info = await stat(skillMd);
          if (!info.isFile()) return;
        } catch {
          return;
        }
        const order = await readSkillOrder(skillMd);
        found.push({ id: entry.name, order });
      }),
  );
  return found
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((entry) => entry.id);
}

function makeContext(
  prs: readonly NormalizedPullRequest[],
  reportInput: ReportInput,
  options: AnalyzeOptions,
  period: Period,
  config: Record<string, unknown>,
  isBotLogin: (login: string) => boolean,
): AnalysisContext {
  return {
    rawPrs: prs,
    input: reportInput,
    now: options.now,
    timezone: options.timezone,
    weekStart: period.start,
    weekEnd: period.end,
    config,
    isBotLogin,
  };
}

function stripCodeFence(output: string): string {
  const trimmed = output.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

async function runAiAnalysis(
  desc: AnalysisDescriptor,
  reportInput: ReportInput,
  runner: AiRunner,
): Promise<AnalysisResult> {
  if (reportInput.prs.length === 0) {
    return noData(desc, "no PRs in the reporting window");
  }
  const payload = {
    section: { id: desc.id },
    week: reportInput.week,
    prs: reportInput.prs,
  };
  try {
    const output = await runner({ skillId: desc.id, payload });
    const markdown = stripCodeFence(output);
    if (!markdown) {
      throw new Error("AI returned empty output");
    }
    return ok(desc, markdown);
  } catch (error) {
    return errored(desc, error);
  }
}

export async function analyzeStage(
  period: Period,
  pullRequests: readonly NormalizedPullRequest[],
  options: AnalyzeOptions,
): Promise<AnalyzeResult> {
  const reportInput = buildReportInput({
    pullRequests,
    generatedAt: options.now,
    timezone: options.timezone,
    weekStart: period.start,
    weekEnd: period.end,
    limits: options.limits,
  });

  const skillsRoot = options.skillsRoot ?? "skills";
  const aiSkillIds = await discoverAiSkillIds(skillsRoot);
  if (aiSkillIds.length === 0 && !options.skipAi && options.aiRunner) {
    console.warn(
      `[analyze] no AI skills discovered under "${skillsRoot}"; only compute analyses will run`,
    );
  }
  const ids = [...Object.keys(COMPUTE_REGISTRY), ...aiSkillIds];

  const isBotLogin = createBotLoginMatcher(options.bots?.patterns ?? []);

  const tasks = ids.map(async (id): Promise<AnalysisResult> => {
    const computeEntry: ComputeEntry | undefined = COMPUTE_REGISTRY[id];
    const isAi = !computeEntry;
    const desc: AnalysisDescriptor = {
      id,
      type: isAi ? "ai" : "compute",
      enabled: true,
      ...(computeEntry ? { renderer: computeEntry.renderer } : {}),
    };

    if (computeEntry) {
      const ctx = makeContext(pullRequests, reportInput, options, period, {}, isBotLogin);
      return runWithFailure(desc, () => computeEntry.compute(ctx));
    }

    if (options.skipAi || !options.aiRunner) {
      return skipped(desc, "AI generation skipped");
    }
    return runAiAnalysis(desc, reportInput, options.aiRunner);
  });

  const results = await Promise.all(tasks);

  return { period, results, reportInput };
}
