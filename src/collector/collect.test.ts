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
  const body = `repositories = [${entries.join(", ")}]\n`;
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
    expect(body.variables.q).toBe("repo:openai/codex is:pr created:>=2026-01-01");
    expect(body.variables.after).toBeNull();
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
