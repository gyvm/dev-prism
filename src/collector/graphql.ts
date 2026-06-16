import { CollectorError } from "../shared/errors.js";
import type { RepositoryConfig } from "../shared/types.js";

const GITHUB_GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const MAX_PAGES = 100;
// Runaway safety valve for child-connection pagination (per connection, per PR).
// At 100 nodes/page this allows up to ~10k items before failing loudly.
const MAX_CHILD_PAGES = 100;

// Page sizes per connection. Shared between the main search query and the
// node(id:) follow-up queries so both request the same window.
const PR_SEARCH_PAGE_SIZE = 10;
const REVIEW_PAGE_SIZE = 100;
const REVIEW_REQUEST_PAGE_SIZE = 100;
const TIMELINE_PAGE_SIZE = 100;
const ISSUE_COMMENT_PAGE_SIZE = 100;
const REVIEW_THREAD_PAGE_SIZE = 50;
const REVIEW_COMMENT_PAGE_SIZE = 50;
const COMMIT_PAGE_SIZE = 50;
const FILE_PAGE_SIZE = 100;

export type GraphQLPageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

type GraphQLConnection<T> = {
  nodes?: Array<T | null> | null;
  pageInfo?: GraphQLPageInfo | null;
};

type GraphQLLabelNode = {
  name: string;
};

type GraphQLRepository = {
  id?: string | null;
  name?: string | null;
  owner?: { login?: string | null } | null;
  visibility?: string | null;
};

type GraphQLActor = {
  __typename?: string | null;
  id?: string | null;
  login?: string | null;
  slug?: string | null;
  name?: string | null;
  url?: string | null;
};

export type GraphQLReviewNode = {
  id?: string | null;
  author?: GraphQLActor | null;
  state?: string | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
  commit?: { oid?: string | null } | null;
  url?: string | null;
  bodyText?: string | null;
};

export type GraphQLReviewRequestNode = {
  id?: string | null;
  asCodeOwner?: boolean | null;
  requestedReviewer?: GraphQLActor | null;
};

export type GraphQLTimelineItemNode = {
  id?: string | null;
  __typename?: string | null;
  createdAt?: string | null;
  actor?: GraphQLActor | null;
  requestedReviewer?: GraphQLActor | null;
};

export type GraphQLPullRequestNode = {
  __typename?: string | null;
  id?: string | null;
  number?: number | null;
  title?: string | null;
  bodyText?: string | null;
  url?: string | null;
  state?: string | null;
  repository?: GraphQLRepository | null;
  author?: GraphQLActor | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  mergedAt?: string | null;
  closedAt?: string | null;
  mergedBy?: GraphQLActor | null;
  isDraft?: boolean | null;
  additions?: number | null;
  deletions?: number | null;
  changedFiles?: number | null;
  labels?: GraphQLConnection<GraphQLLabelNode> | null;
  reviews?: GraphQLConnection<GraphQLReviewNode> | null;
  reviewRequests?: GraphQLConnection<GraphQLReviewRequestNode> | null;
  timelineItems?: GraphQLConnection<GraphQLTimelineItemNode> | null;
  comments?: GraphQLConnection<GraphQLCommentNode> | null;
  reviewThreads?: GraphQLConnection<GraphQLReviewThreadNode> | null;
  commits?: GraphQLConnection<GraphQLCommitNode> | null;
  files?: GraphQLConnection<GraphQLChangedFileNode> | null;
};

export type GraphQLCommentNode = {
  id?: string | null;
  author?: GraphQLActor | null;
  bodyText?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  url?: string | null;
  path?: string | null;
  line?: number | null;
  startLine?: number | null;
  originalLine?: number | null;
  state?: string | null;
  outdated?: boolean | null;
  pullRequestReview?: { id?: string | null } | null;
};

export type GraphQLReviewThreadNode = {
  id?: string | null;
  isResolved?: boolean | null;
  isOutdated?: boolean | null;
  path?: string | null;
  line?: number | null;
  startLine?: number | null;
  subjectType?: string | null;
  resolvedBy?: GraphQLActor | null;
  comments?: GraphQLConnection<GraphQLCommentNode> | null;
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

// --- GraphQL fragments and shared selection sets -----------------------------

const ACTOR_FRAGMENT = `
  fragment ActorFields on Actor {
    __typename
    login
    url
    ... on Node {
      id
    }
    ... on User {
      name
    }
    ... on Organization {
      name
    }
  }
`;

const REQUESTED_REVIEWER_FRAGMENT = `
  fragment RequestedReviewerFields on RequestedReviewer {
    __typename
    ... on Bot {
      id
      login
      url
    }
    ... on Mannequin {
      id
      login
      url
    }
    ... on Team {
      id
      slug
      name
      url
    }
    ... on User {
      id
      login
      name
      url
    }
    ... on EnterpriseTeam {
      id
      slug
      name
      url
    }
  }
`;

const PAGE_INFO = "pageInfo {\n  hasNextPage\n  endCursor\n}";

// Per-connection node selection sets. Defined once and interpolated into both
// the main search query and the node(id:) follow-up queries so the two never
// drift out of sync.
const reviewNodeFields = `
  id
  author {
    ...ActorFields
  }
  state
  submittedAt
  updatedAt
  commit {
    oid
  }
  url
  bodyText
`;

const reviewRequestNodeFields = `
  id
  asCodeOwner
  requestedReviewer {
    ...RequestedReviewerFields
  }
`;

const timelineNodeFields = `
  __typename
  ... on ReadyForReviewEvent {
    id
    createdAt
    actor {
      ...ActorFields
    }
  }
  ... on ReviewRequestedEvent {
    id
    createdAt
    actor {
      ...ActorFields
    }
    requestedReviewer {
      ...RequestedReviewerFields
    }
  }
`;

const issueCommentNodeFields = `
  id
  author {
    ...ActorFields
  }
  bodyText
  createdAt
  updatedAt
  url
`;

const reviewCommentNodeFields = `
  id
  author {
    ...ActorFields
  }
  bodyText
  createdAt
  updatedAt
  url
  path
  line
  startLine
  originalLine
  state
  outdated
  pullRequestReview {
    id
  }
`;

const reviewThreadNodeFields = `
  id
  isResolved
  isOutdated
  path
  line
  startLine
  subjectType
  resolvedBy {
    ...ActorFields
  }
  comments(first: ${REVIEW_COMMENT_PAGE_SIZE}) {
    nodes {
      ${reviewCommentNodeFields}
    }
    ${PAGE_INFO}
  }
`;

const commitNodeFields = `
  commit {
    oid
    committedDate
    authoredDate
    messageHeadline
    author {
      user {
        ...ActorFields
      }
      name
      email
    }
  }
`;

const fileNodeFields = `
  path
  additions
  deletions
  changeType
`;

const TIMELINE_ITEM_TYPES = "itemTypes: [READY_FOR_REVIEW_EVENT, REVIEW_REQUESTED_EVENT]";

// Only include the fragments a selection set actually references — GraphQL
// rejects documents that declare an unused fragment.
function withFragments(body: string): string {
  const fragments: string[] = [];
  if (body.includes("...ActorFields")) {
    fragments.push(ACTOR_FRAGMENT);
  }
  if (body.includes("...RequestedReviewerFields")) {
    fragments.push(REQUESTED_REVIEWER_FRAGMENT);
  }
  return `${fragments.join("\n")}\n${body}`;
}

const pullRequestQuery = withFragments(`
  query SearchPullRequests($q: String!, $after: String) {
    search(query: $q, type: ISSUE, first: ${PR_SEARCH_PAGE_SIZE}, after: $after) {
      nodes {
        __typename
        ... on PullRequest {
          id
          number
          title
          bodyText
          url
          state
          repository {
            id
            name
            owner {
              login
            }
            visibility
          }
          author {
            ...ActorFields
          }
          createdAt
          updatedAt
          mergedAt
          closedAt
          mergedBy {
            ...ActorFields
          }
          isDraft
          additions
          deletions
          changedFiles
          labels(first: 20) {
            nodes {
              name
            }
          }
          reviews(first: ${REVIEW_PAGE_SIZE}) {
            nodes {
              ${reviewNodeFields}
            }
            ${PAGE_INFO}
          }
          reviewRequests(first: ${REVIEW_REQUEST_PAGE_SIZE}) {
            nodes {
              ${reviewRequestNodeFields}
            }
            ${PAGE_INFO}
          }
          timelineItems(first: ${TIMELINE_PAGE_SIZE}, ${TIMELINE_ITEM_TYPES}) {
            nodes {
              ${timelineNodeFields}
            }
            ${PAGE_INFO}
          }
          comments(first: ${ISSUE_COMMENT_PAGE_SIZE}) {
            nodes {
              ${issueCommentNodeFields}
            }
            ${PAGE_INFO}
          }
          reviewThreads(first: ${REVIEW_THREAD_PAGE_SIZE}) {
            nodes {
              ${reviewThreadNodeFields}
            }
            ${PAGE_INFO}
          }
          commits(first: ${COMMIT_PAGE_SIZE}) {
            nodes {
              ${commitNodeFields}
            }
            ${PAGE_INFO}
          }
          files(first: ${FILE_PAGE_SIZE}) {
            nodes {
              ${fileNodeFields}
            }
            ${PAGE_INFO}
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

// Follow-up query for a child connection of a single PullRequest, fetched via
// node(id:). Used to drain connections whose first page reported hasNextPage.
function buildPrChildQuery(
  connection: string,
  pageSize: number,
  nodeFields: string,
  extraArgs?: string,
): string {
  const args = `first: ${pageSize}, after: $after${extraArgs ? `, ${extraArgs}` : ""}`;
  return withFragments(`
    query PaginatePrChild($id: ID!, $after: String) {
      node(id: $id) {
        ... on PullRequest {
          ${connection}(${args}) {
            nodes {
              ${nodeFields}
            }
            ${PAGE_INFO}
          }
        }
      }
    }
  `);
}

type PrChildConnection<T> = {
  connection: string;
  query: string;
  get: (pr: GraphQLPullRequestNode) => GraphQLConnection<T> | null | undefined;
};

const PR_CHILD_CONNECTIONS: ReadonlyArray<PrChildConnection<unknown>> = [
  {
    connection: "reviews",
    query: buildPrChildQuery("reviews", REVIEW_PAGE_SIZE, reviewNodeFields),
    get: (pr) => pr.reviews,
  } as PrChildConnection<GraphQLReviewNode>,
  {
    connection: "reviewRequests",
    query: buildPrChildQuery("reviewRequests", REVIEW_REQUEST_PAGE_SIZE, reviewRequestNodeFields),
    get: (pr) => pr.reviewRequests,
  } as PrChildConnection<GraphQLReviewRequestNode>,
  {
    connection: "timelineItems",
    query: buildPrChildQuery("timelineItems", TIMELINE_PAGE_SIZE, timelineNodeFields, TIMELINE_ITEM_TYPES),
    get: (pr) => pr.timelineItems,
  } as PrChildConnection<GraphQLTimelineItemNode>,
  {
    connection: "comments",
    query: buildPrChildQuery("comments", ISSUE_COMMENT_PAGE_SIZE, issueCommentNodeFields),
    get: (pr) => pr.comments,
  } as PrChildConnection<GraphQLCommentNode>,
  {
    connection: "reviewThreads",
    query: buildPrChildQuery("reviewThreads", REVIEW_THREAD_PAGE_SIZE, reviewThreadNodeFields),
    get: (pr) => pr.reviewThreads,
  } as PrChildConnection<GraphQLReviewThreadNode>,
  {
    connection: "commits",
    query: buildPrChildQuery("commits", COMMIT_PAGE_SIZE, commitNodeFields),
    get: (pr) => pr.commits,
  } as PrChildConnection<GraphQLCommitNode>,
  {
    connection: "files",
    query: buildPrChildQuery("files", FILE_PAGE_SIZE, fileNodeFields),
    get: (pr) => pr.files,
  } as PrChildConnection<GraphQLChangedFileNode>,
];

// Drains a review thread's own comments connection (nested one level deeper
// than the PR). The thread is itself a Node, so we refetch by thread id.
const threadCommentsQuery = withFragments(`
  query PaginateThreadComments($id: ID!, $after: String) {
    node(id: $id) {
      ... on PullRequestReviewThread {
        comments(first: ${REVIEW_COMMENT_PAGE_SIZE}, after: $after) {
          nodes {
            ${reviewCommentNodeFields}
          }
          ${PAGE_INFO}
        }
      }
    }
  }
`);

function isGraphQLResponse(value: unknown): value is GraphQLSearchResponse {
  return typeof value === "object" && value !== null;
}

// Users/Bots have login; Teams have slug; fallback to name for edge cases.
function getReviewerIdentifier(actor: GraphQLActor | null | undefined): string | null {
  return actor?.login ?? actor?.slug ?? actor?.name ?? null;
}

function buildSearchQuery(repository: RepositoryConfig, cutoffDate: Date): string {
  const since = cutoffDate.toISOString().slice(0, 10);
  return `repo:${repository.owner}/${repository.name} is:pr updated:>=${since}`;
}

// Low-level POST + error handling shared by the search query and all follow-up
// node(id:) queries. Returns the GraphQL `data` payload (errors are thrown).
async function postGraphQL(options: {
  query: string;
  variables: Record<string, unknown>;
  repoLabel: string;
  token: string;
  fetchFn: typeof fetch;
}): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await options.fetchFn(GITHUB_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.token}`,
        "user-agent": "gh-insights-collector",
      },
      body: JSON.stringify({
        query: options.query,
        variables: options.variables,
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

  if (rawPayload.errors?.length) {
    throw new CollectorError(
      `GraphQL error for ${options.repoLabel}: ${rawPayload.errors
        .map((error) => error.message ?? "Unknown error")
        .join(", ")}`,
    );
  }

  return (rawPayload.data ?? {}) as Record<string, unknown>;
}

export async function fetchRepositoryPullRequestPage(options: {
  q: string;
  repoLabel: string;
  token: string;
  after: string | null;
  fetchFn?: typeof fetch;
}): Promise<RepositoryPullRequestPage> {
  const fetchFn = options.fetchFn ?? fetch;

  const data = await postGraphQL({
    query: pullRequestQuery,
    variables: { q: options.q, after: options.after },
    repoLabel: options.repoLabel,
    token: options.token,
    fetchFn,
  });

  const search = (data as GraphQLSearchResponse["data"])?.search;
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

// Fetches one follow-up page of a connection reached through node(id:) and
// extracts the connection payload regardless of the parent node type.
async function fetchNodeConnectionPage<T>(options: {
  query: string;
  id: string;
  after: string | null;
  connection: string;
  context: string;
  repoLabel: string;
  token: string;
  fetchFn: typeof fetch;
}): Promise<GraphQLConnection<T>> {
  const data = await postGraphQL({
    query: options.query,
    variables: { id: options.id, after: options.after },
    repoLabel: options.repoLabel,
    token: options.token,
    fetchFn: options.fetchFn,
  });

  const node = (data as { node?: Record<string, unknown> | null }).node;
  if (!node || typeof node !== "object") {
    throw new CollectorError(
      `GraphQL follow-up for ${options.context} did not return a node (id ${options.id})`,
    );
  }

  const connection = (node as Record<string, unknown>)[options.connection] as
    | GraphQLConnection<T>
    | null
    | undefined;
  if (!connection?.pageInfo || !Array.isArray(connection.nodes)) {
    throw new CollectorError(
      `GraphQL follow-up for ${options.context} did not return the ${options.connection} connection`,
    );
  }

  return connection;
}

// Drains a connection to completion starting from its already-fetched first
// page. Appends remaining pages in order and returns the full node list.
async function drainConnection<T>(options: {
  query: string;
  id: string;
  connection: string;
  firstPage: GraphQLConnection<T>;
  context: string;
  repoLabel: string;
  token: string;
  fetchFn: typeof fetch;
}): Promise<Array<T | null>> {
  const nodes: Array<T | null> = [...(options.firstPage.nodes ?? [])];
  let pageInfo = options.firstPage.pageInfo ?? null;
  let pageCount = 1;

  while (pageInfo?.hasNextPage && pageInfo.endCursor !== null) {
    if (pageCount >= MAX_CHILD_PAGES) {
      throw new CollectorError(
        `Child connection pagination limit exceeded for ${options.context}: fetched ${MAX_CHILD_PAGES} pages without exhausting results`,
      );
    }
    pageCount += 1;

    const page = await fetchNodeConnectionPage<T>({
      query: options.query,
      id: options.id,
      after: pageInfo.endCursor,
      connection: options.connection,
      context: options.context,
      repoLabel: options.repoLabel,
      token: options.token,
      fetchFn: options.fetchFn,
    });

    nodes.push(...(page.nodes ?? []));
    pageInfo = page.pageInfo ?? null;
  }

  return nodes;
}

// Completes every child connection of a PR (and the nested comments of each
// review thread) so no child items are silently truncated. Mutates the PR
// node in place by replacing each connection's `nodes` with the full list.
async function hydratePullRequestChildren(options: {
  pr: GraphQLPullRequestNode;
  repoLabel: string;
  token: string;
  fetchFn: typeof fetch;
}): Promise<void> {
  const { pr, repoLabel, token, fetchFn } = options;
  const prKey = `${repoLabel}#${pr.number ?? "?"}`;

  for (const spec of PR_CHILD_CONNECTIONS) {
    const connection = spec.get(pr);
    if (!connection?.pageInfo?.hasNextPage) {
      continue;
    }
    if (typeof pr.id !== "string") {
      throw new CollectorError(
        `Cannot paginate ${spec.connection} for ${prKey}: PR node id is missing`,
      );
    }

    connection.nodes = await drainConnection({
      query: spec.query,
      id: pr.id,
      connection: spec.connection,
      firstPage: connection,
      context: `${prKey} ${spec.connection}`,
      repoLabel,
      token,
      fetchFn,
    });
  }

  // Review threads nest their own comments connection one level deeper.
  for (const thread of pr.reviewThreads?.nodes ?? []) {
    const comments = thread?.comments;
    if (!thread || !comments?.pageInfo?.hasNextPage) {
      continue;
    }
    if (typeof thread.id !== "string") {
      throw new CollectorError(
        `Cannot paginate thread comments for ${prKey}: review thread id is missing`,
      );
    }

    comments.nodes = await drainConnection<GraphQLCommentNode>({
      query: threadCommentsQuery,
      id: thread.id,
      connection: "comments",
      firstPage: comments,
      context: `${prKey} thread ${thread.id} comments`,
      repoLabel,
      token,
      fetchFn,
    });
  }
}

export async function fetchRepositoryPullRequests(options: {
  repository: RepositoryConfig;
  token: string;
  cutoffDate: Date;
  fetchFn?: typeof fetch;
}): Promise<GraphQLPullRequestNode[]> {
  const repoLabel = `${options.repository.owner}/${options.repository.name}`;
  const q = buildSearchQuery(options.repository, options.cutoffDate);
  const fetchFn = options.fetchFn ?? fetch;

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
      fetchFn,
    });

    for (const pr of page.nodes) {
      await hydratePullRequestChildren({ pr, repoLabel, token: options.token, fetchFn });
      allNodes.push(pr);
    }

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
