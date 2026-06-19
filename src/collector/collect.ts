import { resolveToken } from "./auth.js";
import { expandRepositorySpecs } from "./expand-repositories.js";
import { fetchRepositoryPullRequests } from "./graphql.js";
import { normalizePullRequest } from "./normalize.js";
import { loadRepoConfig } from "../shared/config.js";
import { RateLimitError } from "../shared/errors.js";
import { loadRuntimeConfig } from "../shared/runtime.js";
import type { CollectorDependencies, NormalizedPullRequest } from "../shared/types.js";

export type RateLimitOutcome = {
  /** Whether GitHub's primary (hourly points) or secondary (abuse) limit fired. */
  scope: "primary" | "secondary";
  /** Repo being collected when the limit was hit (its data is not persisted). */
  atRepo: string;
  resetAt: Date | null;
  /** Repos not collected because collection stopped (includes `atRepo`). */
  pendingRepos: string[];
};

export type CollectionResult = {
  pullRequests: NormalizedPullRequest[];
  errors: Array<{ repository: string; error: Error }>;
  // Set when collection stopped early because a shared GitHub rate limit was
  // hit. Already-collected repos remain in `pullRequests`; the rest are pending.
  rateLimited?: RateLimitOutcome;
};

export async function collectNormalizedPullRequests(
  dependencies: CollectorDependencies = {},
): Promise<CollectionResult> {
  const { repositories: specs } = await loadRepoConfig(dependencies.configPath);
  const runtimeConfig = loadRuntimeConfig(dependencies.env, dependencies.now);
  const token = await resolveToken(runtimeConfig, dependencies.authFactory);
  const fetchFn = dependencies.fetchFn;
  const repositories = await expandRepositorySpecs(specs, {
    token,
    ...(fetchFn ? { fetchFn } : {}),
  });

  const result: CollectionResult = { pullRequests: [], errors: [] };

  for (let index = 0; index < repositories.length; index += 1) {
    const repository = repositories[index]!;
    const repoLabel = `${repository.owner}/${repository.name}`;
    try {
      const window = dependencies.collectionWindowForRepo
        ? dependencies.collectionWindowForRepo(repository)
        : { since: runtimeConfig.cutoffDate };
      if (window === null) {
        // Repo skipped (e.g. backfill floor already within covered history).
        continue;
      }
      const rawPullRequests = await fetchRepositoryPullRequests({
        repository,
        token,
        cutoffDate: window.since,
        ...(window.until ? { untilDate: window.until } : {}),
        ...(fetchFn ? { fetchFn } : {}),
      });

      for (const rawPullRequest of rawPullRequests) {
        result.pullRequests.push(normalizePullRequest(repository, rawPullRequest));
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        // A rate limit is account-wide, so the remaining repos would fail too.
        // Stop and report; the DWH cursor lets a later re-run resume.
        result.rateLimited = {
          scope: error.scope,
          atRepo: repoLabel,
          resetAt: error.resetAt,
          pendingRepos: repositories.slice(index).map((repo) => `${repo.owner}/${repo.name}`),
        };
        break;
      }
      result.errors.push({
        repository: repoLabel,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return result;
}
