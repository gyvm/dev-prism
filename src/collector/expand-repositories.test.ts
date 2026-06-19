import { afterEach, describe, expect, it, vi } from "vitest";

import { expandRepositorySpecs } from "./expand-repositories.js";
import type { RepositorySpec } from "../shared/types.js";

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function searchResult(items: Array<{ owner: string; name: string }>, totalCount?: number) {
  return {
    total_count: totalCount ?? items.length,
    incomplete_results: false,
    items: items.map((i) => ({ name: i.name, owner: { login: i.owner } })),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("expandRepositorySpecs", () => {
  it("passes through concrete specs unchanged without calling fetch", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const specs: RepositorySpec[] = [
      { kind: "concrete", owner: "openai", name: "codex" },
      { kind: "concrete", owner: "acme-corp", name: "gh-insights" },
    ];

    const result = await expandRepositorySpecs(specs, { token: "t", fetchFn });

    expect(result).toEqual([
      { owner: "openai", name: "codex" },
      { owner: "acme-corp", name: "gh-insights" },
    ]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("targets GITHUB_API_URL when set (GitHub Enterprise Server)", async () => {
    const original = process.env.GITHUB_API_URL;
    process.env.GITHUB_API_URL = "https://ghe.example.com/api/v3";
    try {
      const fetchFn = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse(searchResult([{ owner: "acme-corp", name: "gh-insights" }])));

      await expandRepositorySpecs([{ kind: "wildcard", owner: "acme-corp" }], { token: "t", fetchFn });

      const parsed = new URL(String(fetchFn.mock.calls[0]![0]));
      expect(parsed.origin + parsed.pathname).toBe("https://ghe.example.com/api/v3/search/repositories");
    } finally {
      if (original === undefined) delete process.env.GITHUB_API_URL;
      else process.env.GITHUB_API_URL = original;
    }
  });

  it("expands a wildcard via GitHub Search API with archived:false", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(
        searchResult([
          { owner: "acme-corp", name: "gh-insights" },
          { owner: "acme-corp", name: "opentofu" },
        ]),
      ),
    );

    const result = await expandRepositorySpecs(
      [{ kind: "wildcard", owner: "acme-corp" }],
      { token: "tok123", fetchFn },
    );

    expect(result).toEqual([
      { owner: "acme-corp", name: "gh-insights" },
      { owner: "acme-corp", name: "opentofu" },
    ]);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toContain("search/repositories");
    const parsed = new URL(String(url));
    expect(parsed.searchParams.get("q")).toBe("user:acme-corp archived:false");
    expect(parsed.searchParams.get("per_page")).toBe("100");
    expect(parsed.searchParams.get("page")).toBe("1");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer tok123");
  });

  it("paginates wildcard results until a short page is returned", async () => {
    const page1Items = Array.from({ length: 100 }, (_, i) => ({
      owner: "acme-corp",
      name: `repo-${i + 1}`,
    }));
    const page2Items = [
      { owner: "acme-corp", name: "repo-101" },
      { owner: "acme-corp", name: "repo-102" },
    ];
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(searchResult(page1Items, 102)))
      .mockResolvedValueOnce(jsonResponse(searchResult(page2Items, 102)));

    const result = await expandRepositorySpecs(
      [{ kind: "wildcard", owner: "acme-corp" }],
      { token: "t", fetchFn },
    );

    expect(result).toHaveLength(102);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchFn.mock.calls[1]![0])).searchParams.get("page")).toBe("2");
  });

  it("dedupes overlap between wildcard expansion and concrete entries", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(
        searchResult([
          { owner: "acme-corp", name: "gh-insights" },
          { owner: "acme-corp", name: "opentofu" },
        ]),
      ),
    );

    const result = await expandRepositorySpecs(
      [
        { kind: "concrete", owner: "openai", name: "codex" },
        { kind: "wildcard", owner: "acme-corp" },
        { kind: "concrete", owner: "ACME-CORP", name: "Gh-Insights" },
      ],
      { token: "t", fetchFn },
    );

    expect(result).toEqual([
      { owner: "openai", name: "codex" },
      { owner: "acme-corp", name: "gh-insights" },
      { owner: "acme-corp", name: "opentofu" },
    ]);
  });

  it("warns when total_count exceeds the Search API limit", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        owner: "acme-corp",
        name: `repo-${i + 1}`,
      }));
      return jsonResponse(searchResult(items, 1500));
    });

    await expandRepositorySpecs(
      [{ kind: "wildcard", owner: "acme-corp" }],
      { token: "t", fetchFn },
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/1500.*caps results at 1000/),
    );
  });

  it("throws CollectorError on HTTP failure", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Forbidden", { status: 403, statusText: "Forbidden" }),
    );

    await expect(
      expandRepositorySpecs(
        [{ kind: "wildcard", owner: "acme-corp" }],
        { token: "t", fetchFn },
      ),
    ).rejects.toThrow(/Failed to expand wildcard "acme-corp\/\*".*403/);
  });

  it("throws CollectorError on network failure", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));

    await expect(
      expandRepositorySpecs(
        [{ kind: "wildcard", owner: "acme-corp" }],
        { token: "t", fetchFn },
      ),
    ).rejects.toThrow(/network error/i);
  });

  it("throws CollectorError when wildcard matches nothing", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(searchResult([])));

    await expect(
      expandRepositorySpecs(
        [{ kind: "wildcard", owner: "ghost" }],
        { token: "t", fetchFn },
      ),
    ).rejects.toThrow(/matched no repositories/i);
  });
});
