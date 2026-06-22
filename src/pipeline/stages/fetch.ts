import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  collectNormalizedPullRequests,
  type CollectionResult,
  type RateLimitOutcome,
} from "../../collector/collect.js";
import type {
  CollectorDependencies,
  NormalizedPullRequest,
} from "../../shared/types.js";
import type { Period } from "../period.js";

export type CollectionFailure = Readonly<{ repository: string; message: string }>;

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
  // Per-repo errors and the rate-limit outcome from this collection, surfaced so
  // the orchestrator can flag a partial report instead of presenting it as
  // complete. Empty/undefined for `--use-raw` runs (no live collection).
  errors: readonly CollectionFailure[];
  rateLimited?: RateLimitOutcome;
}>;

function reportCollectionIssues(collected: CollectionResult): void {
  for (const { repository, error } of collected.errors) {
    process.stderr.write(`[warning] ${repository}: ${error.message}\n`);
  }
  if (collected.rateLimited) {
    const { scope, atRepo, resetAt, pendingRepos } = collected.rateLimited;
    const when = resetAt ? `after ${resetAt.toISOString()}` : "in a few minutes";
    process.stderr.write(
      `[rate-limit] GitHub ${scope} rate limit hit at ${atRepo}; stopped with ${pendingRepos.length} repository(s) not yet collected.\n` +
        `  Partial data is being used. Re-run ${when} to fetch the remaining increment.\n`,
    );
  }
}

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
  reportCollectionIssues(collected);

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

  const errors: readonly CollectionFailure[] = collected.errors.map(({ repository, error }) => ({
    repository,
    message: error.message,
  }));
  return {
    period,
    pullRequests: collected.pullRequests,
    rawPath,
    errors,
    ...(collected.rateLimited ? { rateLimited: collected.rateLimited } : {}),
  };
}

export type RawSnapshot = Readonly<{
  period: { id: string; start: string; end: string };
  pullRequests: readonly NormalizedPullRequest[];
}>;

export async function readRawSnapshot(path: string): Promise<RawSnapshot> {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as RawSnapshot;
}
