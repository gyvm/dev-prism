import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { ActorsConfig, AnalysesConfig, CapsConfig } from "../../shared/config.js";
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
  outputRoot?: string;
  caps: CapsConfig;
  timezone: string;
  now: Date;
  skipAi?: boolean;
  aiRunner?: AiRunner;
  skillsRoot?: string;
  analyses?: AnalysesConfig;
  actors?: ActorsConfig;
}>;

export type AnalyzeResult = Readonly<{
  period: Period;
  results: readonly AnalysisResult[];
  reportInput: ReportInput;
  outputDir: string;
}>;

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
  const found: string[] = [];
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const skillMd = join(skillsRoot, entry.name, "SKILL.md");
        try {
          const info = await stat(skillMd);
          if (info.isFile()) found.push(entry.name);
        } catch {
          /* directories without SKILL.md are silently ignored */
        }
      }),
  );
  return found.sort();
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
    caps: options.caps,
  });

  const skillsRoot = options.skillsRoot ?? "skills";
  const aiSkillIds = await discoverAiSkillIds(skillsRoot);
  if (aiSkillIds.length === 0 && !options.skipAi && options.aiRunner) {
    console.warn(
      `[analyze] no AI skills discovered under "${skillsRoot}"; only compute analyses will run`,
    );
  }
  const ids = [...Object.keys(COMPUTE_REGISTRY), ...aiSkillIds];

  const disabled = new Set(options.analyses?.disabled ?? []);
  const overrides = options.analyses?.overrides ?? {};
  const isBotLogin = createBotLoginMatcher(options.actors?.botLoginPatterns ?? []);

  const tasks = ids.map(async (id): Promise<AnalysisResult> => {
    const computeEntry: ComputeEntry | undefined = COMPUTE_REGISTRY[id];
    const isAi = !computeEntry;
    const desc: AnalysisDescriptor = {
      id,
      type: isAi ? "ai" : "compute",
      enabled: !disabled.has(id),
      ...(computeEntry ? { renderer: computeEntry.renderer } : {}),
    };

    if (disabled.has(id)) {
      return skipped(desc, "disabled in config");
    }

    if (computeEntry) {
      const skillConfig = { ...(overrides[id] ?? {}) };
      const ctx = makeContext(pullRequests, reportInput, options, period, skillConfig, isBotLogin);
      return runWithFailure(desc, () => computeEntry.compute(ctx));
    }

    if (options.skipAi || !options.aiRunner) {
      return skipped(desc, "AI generation skipped");
    }
    return runAiAnalysis(desc, reportInput, options.aiRunner);
  });

  const results = await Promise.all(tasks);

  const outputDir = resolve(options.outputRoot ?? "data/analysis", period.id);
  await mkdir(outputDir, { recursive: true });
  await Promise.all(
    results.map((result) => {
      if (result.format === "markdown" && result.status === "ok") {
        const text = typeof result.data === "string" ? result.data : "";
        return writeFile(
          join(outputDir, `${result.id}.md`),
          text.endsWith("\n") ? text : text + "\n",
          "utf-8",
        );
      }
      return writeFile(
        join(outputDir, `${result.id}.json`),
        JSON.stringify(result, null, 2) + "\n",
        "utf-8",
      );
    }),
  );

  await writeFile(
    join(outputDir, "_summary.json"),
    JSON.stringify(
      {
        period: period.id,
        generatedAt: options.now.toISOString(),
        results: results.map((r) => ({
          id: r.id,
          status: r.status,
          ...(r.reason ? { reason: r.reason } : {}),
        })),
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );

  return { period, results, reportInput, outputDir };
}
