import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { collectNormalizedPullRequests } from "./collect.js";
import { fetchRepositoryPullRequests, fetchRepositoryPullRequestPage } from "./graphql.js";
import { resolveToken } from "./auth.js";

async function writeConfig(repositories: Array<{ owner: string; name: string }>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "gh-insights-collect-"));
  const filePath = join(directory, "config.toml");
  const entries = repositories.map((r) => JSON.stringify(`${r.owner}/${r.name}`));
  const body = `[repositories]\ninclude = [${entries.join(", ")}]\n`;
  await writeFile(filePath, body, "utf8");
  return filePath;
}

function createJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function searchPayload(
  nodes: Array<Record<string, unknown>>,
  pageInfo: { hasNextPage: boolean; endCursor: string | null },
) {
  return {
    data: {
      search: {
        nodes: nodes.map((node) => ({ __typename: "PullRequest", ...node })),
        pageInfo,
      },
    },
  };
}

describe("fetchRepositoryPullRequestPage", () => {
  it("wraps network errors with CollectorError", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      fetchRepositoryPullRequestPage({
        q: "repo:openai/codex is:pr created:>=2026-01-01",
        repoLabel: "openai/codex",
        token: "token",
        after: null,
        fetchFn,
      }),
    ).rejects.toThrow(/network error/i);
  });

  it("throws on HTTP error responses", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Forbidden", { status: 403, statusText: "Forbidden" }),
    );

    await expect(
      fetchRepositoryPullRequestPage({
        q: "repo:openai/codex is:pr created:>=2026-01-01",
        repoLabel: "openai/codex",
        token: "token",
        after: null,
        fetchFn,
      }),
    ).rejects.toThrow(/403/);
  });

  it("throws on malformed JSON response", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html>error</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(
      fetchRepositoryPullRequestPage({
        q: "repo:openai/codex is:pr created:>=2026-01-01",
        repoLabel: "openai/codex",
        token: "token",
        after: null,
        fetchFn,
      }),
    ).rejects.toThrow(/not valid JSON/i);
  });

  it("throws on malformed response structure", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ data: { search: null } }),
    );

    await expect(
      fetchRepositoryPullRequestPage({
        q: "repo:openai/codex is:pr created:>=2026-01-01",
        repoLabel: "openai/codex",
        token: "token",
        after: null,
        fetchFn,
      }),
    ).rejects.toThrow(/did not contain pull request nodes/i);
  });
});

describe("fetchRepositoryPullRequests", () => {
  it("paginates until hasNextPage is false", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse(
          searchPayload(
            [
              {
                number: 3,
                title: "First page",
                author: { login: "alice" },
                createdAt: "2026-03-31T00:00:00.000Z",
                additions: 10,
                deletions: 2,
                labels: { nodes: [] },
                reviews: { nodes: [] },
                reviewRequests: { nodes: [] },
              },
            ],
            { hasNextPage: true, endCursor: "cursor-1" },
          ),
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          searchPayload(
            [
              {
                number: 2,
                title: "Second page",
                author: { login: "bob" },
                createdAt: "2026-01-15T00:00:00.000Z",
                additions: 5,
                deletions: 1,
                labels: { nodes: [] },
                reviews: { nodes: [] },
                reviewRequests: { nodes: [] },
              },
            ],
            { hasNextPage: false, endCursor: "cursor-2" },
          ),
        ),
      );

    const pullRequests = await fetchRepositoryPullRequests({
      repository: { owner: "openai", name: "codex" },
      token: "token",
      cutoffDate: new Date("2026-01-01T00:00:00.000Z"),
      fetchFn,
    });

    expect(pullRequests).toHaveLength(2);
    expect(pullRequests.map((pullRequest) => pullRequest.number)).toEqual([3, 2]);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    const firstCall = fetchFn.mock.calls[0]!;
    const body = JSON.parse(String((firstCall[1] as RequestInit).body));
    expect(body.variables.q).toBe("repo:openai/codex is:pr updated:>=2026-01-01");
    expect(body.variables.after).toBeNull();
    expect(body.query).toContain("fragment ActorFields on Actor");
    expect(body.query).toContain("repository {");
    expect(body.query).toContain("updatedAt");
    expect(body.query).toContain("changedFiles");
    expect(body.query).toContain("... on Node");
  });

  it("filters out non-PullRequest nodes defensively", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        data: {
          search: {
            nodes: [
              { __typename: "Issue", number: 99 },
              {
                __typename: "PullRequest",
                number: 1,
                title: "Real PR",
                author: { login: "alice" },
                createdAt: "2026-03-31T00:00:00.000Z",
                additions: 0,
                deletions: 0,
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    );

    const pullRequests = await fetchRepositoryPullRequests({
      repository: { owner: "openai", name: "codex" },
      token: "token",
      cutoffDate: new Date("2026-01-01T00:00:00.000Z"),
      fetchFn,
    });

    expect(pullRequests).toHaveLength(1);
    expect(pullRequests[0]!.number).toBe(1);
  });

  it("fails when GraphQL returns an error payload", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        errors: [{ message: "boom" }],
      }),
    );

    await expect(
      fetchRepositoryPullRequests({
        repository: { owner: "openai", name: "codex" },
        token: "token",
        cutoffDate: new Date("2026-01-01T00:00:00.000Z"),
        fetchFn,
      }),
    ).rejects.toThrow(/openai\/codex/i);
  });
});

type PageInfo = { hasNextPage: boolean; endCursor: string | null };

function nodeChildPayload(
  connection: string,
  nodes: Array<Record<string, unknown>>,
  pageInfo: PageInfo,
) {
  return { data: { node: { [connection]: { nodes, pageInfo } } } };
}

// Routes GraphQL POSTs to the right canned response based on the query body:
// the initial search, a PR child-connection follow-up, or a thread-comments
// follow-up. Follow-up responses are pulled from per-connection queues.
function routedFetch(options: {
  search: unknown[];
  child?: Record<string, unknown[]>;
  threadComments?: unknown[];
}): typeof fetch {
  const search = [...options.search];
  const child: Record<string, unknown[]> = {};
  for (const [key, value] of Object.entries(options.child ?? {})) {
    child[key] = [...value];
  }
  const threadComments = [...(options.threadComments ?? [])];

  return vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const body = JSON.parse(String((init as RequestInit).body));
    const query: string = body.query;

    if (query.includes("query SearchPullRequests")) {
      return createJsonResponse(search.shift());
    }
    if (query.includes("PaginateThreadComments")) {
      return createJsonResponse(threadComments.shift());
    }
    const match = query.match(/on PullRequest\s*\{\s*(\w+)\s*\(/);
    if (match) {
      const connection = match[1]!;
      return createJsonResponse((child[connection] ?? []).shift());
    }
    throw new Error(`Unexpected GraphQL query:\n${query}`);
  });
}

describe("fetchRepositoryPullRequests child connection pagination", () => {
  it("drains a child connection across follow-up pages via node(id:)", async () => {
    const fetchFn = routedFetch({
      search: [
        searchPayload(
          [
            {
              id: "PR_1",
              number: 7,
              title: "Big review thread",
              author: { login: "alice" },
              createdAt: "2026-03-31T00:00:00.000Z",
              additions: 1,
              deletions: 0,
              reviews: {
                nodes: [{ id: "R1", author: { login: "rev1" }, state: "COMMENTED", submittedAt: "2026-03-31T01:00:00.000Z" }],
                pageInfo: { hasNextPage: true, endCursor: "rc1" },
              },
            },
          ],
          { hasNextPage: false, endCursor: null },
        ),
      ],
      child: {
        reviews: [
          nodeChildPayload(
            "reviews",
            [{ id: "R2", author: { login: "rev2" }, state: "APPROVED", submittedAt: "2026-03-31T02:00:00.000Z" }],
            { hasNextPage: true, endCursor: "rc2" },
          ),
          nodeChildPayload(
            "reviews",
            [{ id: "R3", author: { login: "rev3" }, state: "APPROVED", submittedAt: "2026-03-31T03:00:00.000Z" }],
            { hasNextPage: false, endCursor: "rc3" },
          ),
        ],
      },
    });

    const pullRequests = await fetchRepositoryPullRequests({
      repository: { owner: "openai", name: "codex" },
      token: "token",
      cutoffDate: new Date("2026-01-01T00:00:00.000Z"),
      fetchFn,
    });

    expect(pullRequests).toHaveLength(1);
    expect(pullRequests[0]!.reviews?.nodes?.map((r) => r?.id)).toEqual(["R1", "R2", "R3"]);
    // 1 search + 2 review follow-ups.
    expect(fetchFn).toHaveBeenCalledTimes(3);

    const followUp = JSON.parse(String((fetchFn.mock.calls[1]![1] as RequestInit).body));
    expect(followUp.query).toContain("PaginatePrChild");
    expect(followUp.variables).toEqual({ id: "PR_1", after: "rc1" });
  });

  it("drains multiple child connections on one PR without cross-wiring", async () => {
    const fetchFn = routedFetch({
      search: [
        searchPayload(
          [
            {
              id: "PR_M",
              number: 42,
              title: "Big PR",
              author: { login: "alice" },
              createdAt: "2026-03-31T00:00:00.000Z",
              additions: 1,
              deletions: 0,
              reviews: { nodes: [{ id: "R1", author: { login: "r" }, state: "APPROVED", submittedAt: "2026-03-31T01:00:00.000Z" }], pageInfo: { hasNextPage: true, endCursor: "rc1" } },
              commits: { nodes: [{ commit: { oid: "C1", committedDate: "2026-03-30T00:00:00.000Z", messageHeadline: "a" } }], pageInfo: { hasNextPage: true, endCursor: "cc1" } },
              files: { nodes: [{ path: "a.ts", additions: 1, deletions: 0, changeType: "MODIFIED" }], pageInfo: { hasNextPage: true, endCursor: "fc1" } },
            },
          ],
          { hasNextPage: false, endCursor: null },
        ),
      ],
      child: {
        reviews: [nodeChildPayload("reviews", [{ id: "R2", author: { login: "r" }, state: "COMMENTED", submittedAt: "2026-03-31T02:00:00.000Z" }], { hasNextPage: false, endCursor: "rc2" })],
        commits: [nodeChildPayload("commits", [{ commit: { oid: "C2", committedDate: "2026-03-30T06:00:00.000Z", messageHeadline: "b" } }], { hasNextPage: false, endCursor: "cc2" })],
        files: [nodeChildPayload("files", [{ path: "b.ts", additions: 2, deletions: 1, changeType: "ADDED" }], { hasNextPage: false, endCursor: "fc2" })],
      },
    });

    const prs = await fetchRepositoryPullRequests({
      repository: { owner: "openai", name: "codex" },
      token: "token",
      cutoffDate: new Date("2026-01-01T00:00:00.000Z"),
      fetchFn,
    });

    const pr = prs[0]!;
    expect(pr.reviews?.nodes?.map((n) => n?.id)).toEqual(["R1", "R2"]);
    expect(pr.commits?.nodes?.map((n) => n?.commit?.oid)).toEqual(["C1", "C2"]);
    expect(pr.files?.nodes?.map((n) => n?.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("drains a review thread's nested comments connection", async () => {
    const fetchFn = routedFetch({
      search: [
        searchPayload(
          [
            {
              id: "PR_2",
              number: 8,
              title: "Thread with many comments",
              author: { login: "alice" },
              createdAt: "2026-03-31T00:00:00.000Z",
              additions: 1,
              deletions: 0,
              reviewThreads: {
                nodes: [
                  {
                    id: "TH_1",
                    isResolved: false,
                    isOutdated: false,
                    path: "src/a.ts",
                    comments: {
                      nodes: [{ id: "C1", author: { login: "u1" }, bodyText: "first", createdAt: "2026-03-31T01:00:00.000Z", path: "src/a.ts" }],
                      pageInfo: { hasNextPage: true, endCursor: "cc1" },
                    },
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
          { hasNextPage: false, endCursor: null },
        ),
      ],
      threadComments: [
        {
          data: {
            node: {
              comments: {
                nodes: [{ id: "C2", author: { login: "u2" }, bodyText: "second", createdAt: "2026-03-31T02:00:00.000Z", path: "src/a.ts" }],
                pageInfo: { hasNextPage: false, endCursor: "cc2" },
              },
            },
          },
        },
      ],
    });

    const pullRequests = await fetchRepositoryPullRequests({
      repository: { owner: "openai", name: "codex" },
      token: "token",
      cutoffDate: new Date("2026-01-01T00:00:00.000Z"),
      fetchFn,
    });

    const thread = pullRequests[0]!.reviewThreads?.nodes?.[0]!;
    expect(thread.comments?.nodes?.map((c) => c?.id)).toEqual(["C1", "C2"]);

    const followUp = JSON.parse(String((fetchFn.mock.calls[1]![1] as RequestInit).body));
    expect(followUp.query).toContain("PaginateThreadComments");
    expect(followUp.variables).toEqual({ id: "TH_1", after: "cc1" });
  });

  it("stops draining a child connection when endCursor is null despite hasNextPage", async () => {
    const fetchFn = routedFetch({
      search: [
        searchPayload(
          [
            {
              id: "PR_N",
              number: 5,
              title: "Null cursor",
              author: { login: "alice" },
              createdAt: "2026-03-31T00:00:00.000Z",
              additions: 1,
              deletions: 0,
              reviews: { nodes: [{ id: "R1", author: { login: "r" }, state: "APPROVED", submittedAt: "2026-03-31T01:00:00.000Z" }], pageInfo: { hasNextPage: true, endCursor: null } },
            },
          ],
          { hasNextPage: false, endCursor: null },
        ),
      ],
    });

    const prs = await fetchRepositoryPullRequests({
      repository: { owner: "openai", name: "codex" },
      token: "token",
      cutoffDate: new Date("2026-01-01T00:00:00.000Z"),
      fetchFn,
    });

    // No usable cursor → stop cleanly (no infinite loop, no follow-up request).
    expect(prs[0]!.reviews?.nodes?.map((n) => n?.id)).toEqual(["R1"]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does not issue follow-ups when no child connection has another page", async () => {
    const fetchFn = routedFetch({
      search: [
        searchPayload(
          [
            {
              id: "PR_3",
              number: 9,
              title: "Small PR",
              author: { login: "alice" },
              createdAt: "2026-03-31T00:00:00.000Z",
              additions: 1,
              deletions: 0,
              reviews: { nodes: [{ id: "R1", author: { login: "rev1" }, state: "APPROVED", submittedAt: "2026-03-31T01:00:00.000Z" }], pageInfo: { hasNextPage: false, endCursor: "rc1" } },
            },
          ],
          { hasNextPage: false, endCursor: null },
        ),
      ],
    });

    await fetchRepositoryPullRequests({
      repository: { owner: "openai", name: "codex" },
      token: "token",
      cutoffDate: new Date("2026-01-01T00:00:00.000Z"),
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("fails loudly when a connection needs pagination but the PR id is missing", async () => {
    const fetchFn = routedFetch({
      search: [
        searchPayload(
          [
            {
              number: 10,
              title: "No id PR",
              author: { login: "alice" },
              createdAt: "2026-03-31T00:00:00.000Z",
              additions: 1,
              deletions: 0,
              reviews: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "rc1" } },
            },
          ],
          { hasNextPage: false, endCursor: null },
        ),
      ],
    });

    await expect(
      fetchRepositoryPullRequests({
        repository: { owner: "openai", name: "codex" },
        token: "token",
        cutoffDate: new Date("2026-01-01T00:00:00.000Z"),
        fetchFn,
      }),
    ).rejects.toThrow(/PR node id is missing/i);
  });
});

describe("collectNormalizedPullRequests", () => {
  it("aggregates multiple repositories sequentially", async () => {
    const configPath = await writeConfig([
      { owner: "openai", name: "codex" },
      { owner: "openai", name: "evals" },
    ]);

    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse(
          searchPayload(
            [
              {
                number: 1,
                title: "Codex PR",
                author: { login: "alice" },
                createdAt: "2026-03-31T00:00:00.000Z",
                additions: 10,
                deletions: 2,
                labels: { nodes: [{ name: "collector" }] },
                reviews: { nodes: [] },
                reviewRequests: { nodes: [] },
              },
            ],
            { hasNextPage: false, endCursor: null },
          ),
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          searchPayload(
            [
              {
                number: 2,
                title: "Evals PR",
                author: { login: "bob" },
                createdAt: "2026-03-30T00:00:00.000Z",
                additions: 7,
                deletions: 3,
                labels: { nodes: [] },
                reviews: { nodes: [] },
                reviewRequests: { nodes: [] },
              },
            ],
            { hasNextPage: false, endCursor: null },
          ),
        ),
      );

    const result = await collectNormalizedPullRequests({
      configPath,
      fetchFn,
      env: {
        GITHUB_TOKEN: "ghp_test123",
      },
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.pullRequests).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.pullRequests.map((pr) => `${pr.repo.owner}/${pr.repo.name}`)).toEqual([
      "openai/codex",
      "openai/evals",
    ]);
  });

  it("isolates per-repository errors and continues collection", async () => {
    const configPath = await writeConfig([
      { owner: "openai", name: "codex" },
      { owner: "openai", name: "evals" },
    ]);

    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" }))
      .mockResolvedValueOnce(
        createJsonResponse(
          searchPayload(
            [
              {
                number: 1,
                title: "Evals PR",
                author: { login: "alice" },
                createdAt: "2026-03-31T00:00:00.000Z",
                additions: 5,
                deletions: 1,
              },
            ],
            { hasNextPage: false, endCursor: null },
          ),
        ),
      );

    const result = await collectNormalizedPullRequests({
      configPath,
      fetchFn,
      env: {
        GITHUB_TOKEN: "ghp_test123",
      },
      now: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.pullRequests).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.repository).toBe("openai/codex");
  });
});

describe("resolveToken", () => {
  it("returns GITHUB_TOKEN directly when available", async () => {
    const token = await resolveToken({
      githubToken: "ghp_abc123",
      githubAppId: null,
      githubAppPrivateKey: null,
      githubAppInstallationId: null,
      lookbackDays: 90,
      firstReviewThresholdHours: 48,
      cutoffDate: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(token).toBe("ghp_abc123");
  });

  it("falls back to GitHub App auth when no PAT", async () => {
    const token = await resolveToken(
      {
        githubToken: null,
        githubAppId: "123",
        githubAppPrivateKey: "key",
        githubAppInstallationId: 456,
        lookbackDays: 90,
        firstReviewThresholdHours: 48,
        cutoffDate: new Date("2026-01-01T00:00:00.000Z"),
      },
      vi.fn().mockResolvedValue("app-token"),
    );

    expect(token).toBe("app-token");
  });

  it("wraps auth factory failures with a collector error", async () => {
    await expect(
      resolveToken(
        {
          githubToken: null,
          githubAppId: "123",
          githubAppPrivateKey: "key",
          githubAppInstallationId: 456,
          lookbackDays: 90,
          firstReviewThresholdHours: 48,
          cutoffDate: new Date("2026-01-01T00:00:00.000Z"),
        },
        vi.fn().mockRejectedValue(new Error("auth failed")),
      ),
    ).rejects.toThrow(/installation token/i);
  });
});
