import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { collectNormalizedPullRequests } from "../../collector/collect.js";
import type {
  CollectorDependencies,
  NormalizedPullRequest,
} from "../../shared/types.js";
import type { Period } from "../period.js";

export type FetchOptions = Readonly<{
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
  now?: Date;
  outputRoot?: string;
}>;

export type FetchResult = Readonly<{
  period: Period;
  pullRequests: readonly NormalizedPullRequest[];
  rawPath: string;
}>;

export async function fetchStage(
  period: Period,
  options: FetchOptions = {},
): Promise<FetchResult> {
  const collectorDeps: CollectorDependencies = {
    ...(options.configPath ? { configPath: options.configPath } : {}),
    ...(options.env ? { env: options.env } : {}),
    ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
    now: options.now ?? new Date(),
  };

  const collected = await collectNormalizedPullRequests(collectorDeps);

  const rawPath = resolve(options.outputRoot ?? "data/raw", `${period.id}.json`);
  await mkdir(dirname(rawPath), { recursive: true });
  await writeFile(
    rawPath,
    JSON.stringify(
      {
        period: { id: period.id, start: period.start.toISOString(), end: period.end.toISOString() },
        pullRequests: collected.pullRequests,
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );

  return { period, pullRequests: collected.pullRequests, rawPath };
}

export type RawSnapshot = Readonly<{
  period: { id: string; start: string; end: string };
  pullRequests: readonly NormalizedPullRequest[];
}>;

export async function readRawSnapshot(path: string): Promise<RawSnapshot> {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as RawSnapshot;
}
