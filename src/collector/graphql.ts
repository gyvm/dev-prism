import { CollectorError } from "../shared/errors.js";
import type { RepositoryConfig } from "../shared/types.js";

const GITHUB_GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const MAX_PAGES = 100;

export type GraphQLPageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

type GraphQLLabelNode = {
  name: string;
};

type GraphQLActor = {
  login?: string | null;
  slug?: string | null;
  name?: string | null;
};

export type GraphQLReviewNode = {
  author?: GraphQLActor | null;
  state?: string | null;
  submittedAt?: string | null;
  bodyText?: string | null;
};

export type GraphQLReviewRequestNode = {
  requestedReviewer?: GraphQLActor | null;
};

export type GraphQLTimelineItemNode = {
  __typename?: string | null;
  createdAt?: string | null;
};

export type GraphQLPullRequestNode = {
  __typename?: string | null;
  number?: number | null;
  title?: string | null;
  bodyText?: string | null;
  url?: string | null;
  state?: string | null;
  author?: GraphQLActor | null;
  createdAt?: string | null;
  mergedAt?: string | null;
  closedAt?: string | null;
  isDraft?: boolean | null;
  additions?: number | null;
  deletions?: number | null;
  labels?: {
    nodes?: Array<GraphQLLabelNode | null> | null;
  } | null;
  reviews?: {
    nodes?: Array<GraphQLReviewNode | null> | null;
  } | null;
  reviewRequests?: {
    nodes?: Array<GraphQLReviewRequestNode | null> | null;
  } | null;
  timelineItems?: {
    nodes?: Array<GraphQLTimelineItemNode | null> | null;
  } | null;
  comments?: {
    nodes?: Array<GraphQLCommentNode | null> | null;
  } | null;
  reviewThreads?: {
    nodes?: Array<GraphQLReviewThreadNode | null> | null;
  } | null;
  commits?: {
    nodes?: Array<GraphQLCommitNode | null> | null;
  } | null;
  files?: {
    nodes?: Array<GraphQLChangedFileNode | null> | null;
  } | null;
};

export type GraphQLCommentNode = {
  author?: GraphQLActor | null;
  bodyText?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  url?: string | null;
  path?: string | null;
  line?: number | null;
};

export type GraphQLReviewThreadNode = {
  isResolved?: boolean | null;
  isOutdated?: boolean | null;
  path?: string | null;
  line?: number | null;
  startLine?: number | null;
  comments?: {
    nodes?: Array<GraphQLCommentNode | null> | null;
  } | null;
};

export type GraphQLCommitNode = {
  commit?: {
    oid?: string | null;
    committedDate?: string | null;
    authoredDate?: string | null;
    messageHeadline?: string | null;
    author?: {
      user?: GraphQLActor | null;
      name?: string | null;
      email?: string | null;
    } | null;
  } | null;
};

export type GraphQLChangedFileNode = {
  path?: string | null;
  additions?: number | null;
  deletions?: number | null;
  changeType?: string | null;
};

type GraphQLSearchResponse = {
  data?: {
    search?: {
      nodes?: Array<GraphQLPullRequestNode | null> | null;
      pageInfo?: GraphQLPageInfo | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

export type RepositoryPullRequestPage = {
  nodes: GraphQLPullRequestNode[];
  pageInfo: GraphQLPageInfo;
};

const pullRequestQuery = `
  query SearchPullRequests($q: String!, $after: String) {
    search(query: $q, type: ISSUE, first: 10, after: $after) {
      nodes {
        __typename
        ... on PullRequest {
          number
          title
          bodyText
          url
          state
          author {
            login
          }
          createdAt
          mergedAt
          closedAt
          isDraft
          additions
          deletions
          labels(first: 20) {
            nodes {
              name
            }
          }
          reviews(first: 100) {
            nodes {
              author {
                login
              }
              state
              submittedAt
              bodyText
            }
          }
          reviewRequests(first: 100) {
            nodes {
              requestedReviewer {
                __typename
                ... on User {
                  login
                }
                ... on Team {
                  slug
                  name
                }
                ... on Bot {
                  login
                }
              }
            }
          }
          timelineItems(first: 100, itemTypes: [READY_FOR_REVIEW_EVENT, REVIEW_REQUESTED_EVENT]) {
            nodes {
              __typename
              ... on ReadyForReviewEvent {
                createdAt
              }
              ... on ReviewRequestedEvent {
                createdAt
              }
            }
          }
          comments(first: 100) {
            nodes {
              author {
                login
              }
              bodyText
              createdAt
              updatedAt
              url
            }
          }
          reviewThreads(first: 50) {
            nodes {
              isResolved
              isOutdated
              path
              line
              startLine
              comments(first: 50) {
                nodes {
                  author {
                    login
                  }
                  bodyText
                  createdAt
                  updatedAt
                  url
                  path
                  line
                }
              }
            }
          }
          commits(first: 50) {
            nodes {
              commit {
                oid
                committedDate
                authoredDate
                messageHeadline
                author {
                  user {
                    login
                  }
                  name
                  email
                }
              }
            }
          }
          files(first: 100) {
            nodes {
              path
              additions
              deletions
              changeType
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

function isGraphQLResponse(value: unknown): value is GraphQLSearchResponse {
  return typeof value === "object" && value !== null;
}

// Users/Bots have login; Teams have slug; fallback to name for edge cases.
function getReviewerIdentifier(actor: GraphQLActor | null | undefined): string | null {
  return actor?.login ?? actor?.slug ?? actor?.name ?? null;
}

function buildSearchQuery(repository: RepositoryConfig, cutoffDate: Date): string {
  const since = cutoffDate.toISOString().slice(0, 10);
  // Filter on `updated`, not `created`: a PR opened before the window but merged
  // or reviewed during it is still week activity and must be fetched. Downstream
  // (selectActiveWeekPrs) trims this superset to the precise week.
  return `repo:${repository.owner}/${repository.name} is:pr updated:>=${since}`;
}

export async function fetchRepositoryPullRequestPage(options: {
  q: string;
  repoLabel: string;
  token: string;
  after: string | null;
  fetchFn?: typeof fetch;
}): Promise<RepositoryPullRequestPage> {
  const fetchFn = options.fetchFn ?? fetch;

  let response: Response;
  try {
    response = await fetchFn(GITHUB_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.token}`,
        "user-agent": "gh-insights-collector",
      },
      body: JSON.stringify({
        query: pullRequestQuery,
        variables: {
          q: options.q,
          after: options.after,
        },
      }),
    });
  } catch (error) {
    throw new CollectorError(
      `Network error while fetching pull requests for ${options.repoLabel}`,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new CollectorError(
      `GraphQL request failed for ${options.repoLabel}: ${response.status} ${response.statusText}`,
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = await response.json();
  } catch (error) {
    throw new CollectorError(
      `Failed to parse GraphQL response for ${options.repoLabel}: response was not valid JSON`,
      { cause: error },
    );
  }

  if (!isGraphQLResponse(rawPayload)) {
    throw new CollectorError(
      `GraphQL response for ${options.repoLabel} was not an object`,
    );
  }

  const payload = rawPayload;
  if (payload.errors?.length) {
    throw new CollectorError(
      `GraphQL error for ${options.repoLabel}: ${payload.errors
        .map((error) => error.message ?? "Unknown error")
        .join(", ")}`,
    );
  }

  const search = payload.data?.search;
  if (!search?.pageInfo || !Array.isArray(search.nodes)) {
    throw new CollectorError(
      `GraphQL response for ${options.repoLabel} did not contain pull request nodes`,
    );
  }

  const nodes = search.nodes.filter(
    (node): node is GraphQLPullRequestNode =>
      node !== null && (node.__typename === undefined || node.__typename === "PullRequest"),
  );

  return {
    nodes,
    pageInfo: {
      hasNextPage: search.pageInfo.hasNextPage,
      endCursor: search.pageInfo.endCursor,
    },
  };
}

export async function fetchRepositoryPullRequests(options: {
  repository: RepositoryConfig;
  token: string;
  cutoffDate: Date;
  fetchFn?: typeof fetch;
}): Promise<GraphQLPullRequestNode[]> {
  const repoLabel = `${options.repository.owner}/${options.repository.name}`;
  const q = buildSearchQuery(options.repository, options.cutoffDate);

  const allNodes: GraphQLPullRequestNode[] = [];
  let after: string | null = null;
  let pageCount = 0;

  while (pageCount < MAX_PAGES) {
    pageCount += 1;

    const page = await fetchRepositoryPullRequestPage({
      q,
      repoLabel,
      token: options.token,
      after,
      ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
    });

    allNodes.push(...page.nodes);

    if (!page.pageInfo.hasNextPage || page.pageInfo.endCursor === null) {
      return allNodes;
    }

    after = page.pageInfo.endCursor;
  }

  throw new CollectorError(
    `Pagination limit exceeded for ${repoLabel}: fetched ${MAX_PAGES} pages without exhausting results`,
  );
}

export { getReviewerIdentifier };
