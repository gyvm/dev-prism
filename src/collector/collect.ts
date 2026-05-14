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

export async function collectNormalizedPullRequests(
  dependencies: CollectorDependencies = {},
): Promise<CollectionResult> {
  const { repositories: specs } = await loadRepoConfig(dependencies.configPath);
  const runtimeConfig = loadRuntimeConfig(dependencies.env, dependencies.now);
  const token = runtimeConfig.githubToken;
  const fetchFn = dependencies.fetchFn;
  const repositories = await expandRepositorySpecs(specs, {
    token,
    ...(fetchFn ? { fetchFn } : {}),
  });

  const result: CollectionResult = { pullRequests: [], errors: [] };

  for (const repository of repositories) {
    const repoLabel = `${repository.owner}/${repository.name}`;
    try {
      const rawPullRequests = await fetchRepositoryPullRequests({
        repository,
        token,
        cutoffDate: runtimeConfig.cutoffDate,
        ...(fetchFn ? { fetchFn } : {}),
      });

      for (const rawPullRequest of rawPullRequests) {
        result.pullRequests.push(normalizePullRequest(repository, rawPullRequest));
      }
    } catch (error) {
      result.errors.push({
        repository: repoLabel,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return result;
}
