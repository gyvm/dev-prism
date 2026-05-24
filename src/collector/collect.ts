import { expandRepositorySpecs } from "./expand-repositories.js";
import { fetchRepositoryPullRequests } from "./graphql.js";
import { normalizePullRequest } from "./normalize.js";
import { loadRepoConfig } from "../shared/config.js";
import { loadRuntimeConfig } from "../shared/runtime.js";
import type { CollectorDependencies, NormalizedPullRequest } from "../shared/types.js";

export type CollectionResult = {
  pullRequests: NormalizedPullRequest[];
  errors: Array<{ repository: string; error: Error }>;
};

// The effective fetch cutoff: the report week start, but never earlier than the
// runtime lookback cap. With no weekStart we fall back to the cap alone (the
// pre-week behavior), so library callers and tests are unaffected.
export function resolveCutoffDate(weekStart: Date | undefined, lookbackFloor: Date): Date {
  if (!weekStart) return lookbackFloor;
  return new Date(Math.max(weekStart.getTime(), lookbackFloor.getTime()));
}

export async function collectNormalizedPullRequests(
  dependencies: CollectorDependencies = {},
): Promise<CollectionResult> {
  const log = dependencies.log ?? (() => {});
  const { repositories: specs } = await loadRepoConfig(dependencies.configPath);
  const runtimeConfig = loadRuntimeConfig(dependencies.env, dependencies.now);
  const token = runtimeConfig.githubToken;
  const fetchFn = dependencies.fetchFn;
  const cutoffDate = resolveCutoffDate(dependencies.weekStart, runtimeConfig.cutoffDate);

  if (dependencies.weekStart && dependencies.weekStart < runtimeConfig.cutoffDate) {
    log(
      `[fetch] requested week start ${dependencies.weekStart.toISOString().slice(0, 10)} ` +
        `predates the ${runtimeConfig.lookbackDays}-day lookback cap; clamping cutoff to ` +
        `${cutoffDate.toISOString().slice(0, 10)}`,
    );
  }

  const repositories = await expandRepositorySpecs(specs, {
    token,
    ...(fetchFn ? { fetchFn } : {}),
  });

  log(
    `[fetch] ${repositories.length} repositories, PRs updated since ` +
      `${cutoffDate.toISOString().slice(0, 10)}`,
  );

  const result: CollectionResult = { pullRequests: [], errors: [] };

  let index = 0;
  for (const repository of repositories) {
    index += 1;
    const repoLabel = `${repository.owner}/${repository.name}`;
    try {
      const rawPullRequests = await fetchRepositoryPullRequests({
        repository,
        token,
        cutoffDate,
        ...(fetchFn ? { fetchFn } : {}),
      });

      for (const rawPullRequest of rawPullRequests) {
        result.pullRequests.push(normalizePullRequest(repository, rawPullRequest));
      }
      log(`[fetch] (${index}/${repositories.length}) ${repoLabel} -> ${rawPullRequests.length} PRs`);
    } catch (error) {
      result.errors.push({
        repository: repoLabel,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      log(`[fetch] (${index}/${repositories.length}) ${repoLabel} -> ERROR`);
    }
  }

  log(`[fetch] collected ${result.pullRequests.length} PRs from ${repositories.length} repositories`);

  return result;
}
