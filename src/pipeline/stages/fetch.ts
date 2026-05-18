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
}>;

export type FetchResult = Readonly<{
  period: Period;
  pullRequests: readonly NormalizedPullRequest[];
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

  return { period, pullRequests: collected.pullRequests };
}
