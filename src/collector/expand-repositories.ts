import { CollectorError } from "../shared/errors.js";
import type { RepositoryConfig, RepositorySpec } from "../shared/types.js";

const GITHUB_SEARCH_ENDPOINT = "https://api.github.com/search/repositories";
const PER_PAGE = 100;
const MAX_PAGES = 10;
const SEARCH_API_HARD_LIMIT = 1000;

type SearchResponse = {
  total_count?: number;
  incomplete_results?: boolean;
  items?: Array<{
    name?: string | null;
    owner?: { login?: string | null } | null;
  } | null>;
};

export type ExpandOptions = Readonly<{
  token: string;
  fetchFn?: typeof fetch;
}>;

export async function expandRepositorySpecs(
  specs: readonly RepositorySpec[],
  options: ExpandOptions,
): Promise<RepositoryConfig[]> {
  const fetchFn = options.fetchFn ?? fetch;
  const collected: RepositoryConfig[] = [];

  for (const spec of specs) {
    if (spec.kind === "concrete") {
      collected.push({ owner: spec.owner, name: spec.name });
      continue;
    }
    const expanded = await fetchWildcardRepositories(spec.owner, fetchFn, options.token);
    collected.push(...expanded);
  }

  return dedupeRepositories(collected);
}

async function fetchWildcardRepositories(
  owner: string,
  fetchFn: typeof fetch,
  token: string,
): Promise<RepositoryConfig[]> {
  const results: RepositoryConfig[] = [];
  const query = `user:${owner} archived:false`;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(GITHUB_SEARCH_ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));

    let response: Response;
    try {
      response = await fetchFn(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
    } catch (error) {
      throw new CollectorError(
        `Failed to expand wildcard "${owner}/*": network error`,
        { cause: error },
      );
    }

    if (!response.ok) {
      const body = await safeReadText(response);
      throw new CollectorError(
        `Failed to expand wildcard "${owner}/*": GitHub responded ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`,
      );
    }

    const payload = (await response.json()) as SearchResponse;
    const items = payload.items ?? [];
    for (const item of items) {
      const name = item?.name?.trim();
      const ownerLogin = item?.owner?.login?.trim();
      if (name && ownerLogin) {
        results.push({ owner: ownerLogin, name });
      }
    }

    if (page === 1 && typeof payload.total_count === "number" && payload.total_count > SEARCH_API_HARD_LIMIT) {
      console.warn(
        `Wildcard "${owner}/*" matched ${payload.total_count} repositories, but the GitHub Search API caps results at ${SEARCH_API_HARD_LIMIT}. Some repositories will be missing.`,
      );
    }

    if (items.length < PER_PAGE) {
      break;
    }
    if (page * PER_PAGE >= SEARCH_API_HARD_LIMIT) {
      break;
    }
  }

  if (results.length === 0) {
    throw new CollectorError(
      `Wildcard "${owner}/*" matched no repositories. Check the owner name and token permissions.`,
    );
  }

  return results;
}

function dedupeRepositories(repositories: readonly RepositoryConfig[]): RepositoryConfig[] {
  const seen = new Set<string>();
  const unique: RepositoryConfig[] = [];
  for (const repo of repositories) {
    const key = `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(repo);
  }
  return unique;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}
