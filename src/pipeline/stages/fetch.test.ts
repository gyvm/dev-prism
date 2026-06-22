import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { fetchStage } from "./fetch.js";
import type { Period } from "../period.js";

function responseWith(status: number, headers: Record<string, string>, body = ""): Response {
  return new Response(body, { status, headers });
}

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "gh-insights-fetch-"));
}

async function writeConfig(repositories: Array<{ owner: string; name: string }>): Promise<string> {
  const directory = await tempDir();
  const filePath = join(directory, "config.toml");
  const entries = repositories.map((r) => JSON.stringify(`${r.owner}/${r.name}`));
  await writeFile(filePath, `[repositories]\ninclude = [${entries.join(", ")}]\n`, "utf8");
  return filePath;
}

const PERIOD: Period = {
  id: "2026-04-27",
  start: new Date("2026-04-27T00:00:00.000Z"),
  end: new Date("2026-05-03T23:59:59.999Z"),
};

describe("fetchStage surfaces partial-collection signals", () => {
  it("propagates a rate-limit outcome instead of silently dropping it", async () => {
    const configPath = await writeConfig([
      { owner: "openai", name: "codex" },
      { owner: "openai", name: "evals" },
    ]);
    const outputRoot = await tempDir();
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(responseWith(403, { "retry-after": "30" }));

    const result = await fetchStage(PERIOD, {
      configPath,
      fetchFn,
      env: { GITHUB_TOKEN: "ghp_test123" },
      now: new Date("2026-04-01T00:00:00.000Z"),
      outputRoot,
    });

    expect(result.rateLimited?.atRepo).toBe("openai/codex");
    expect(result.rateLimited?.pendingRepos).toEqual(["openai/codex", "openai/evals"]);
    expect(result.errors).toHaveLength(0);

    // The raw snapshot is still written (partial data is kept).
    const raw = JSON.parse(await readFile(result.rawPath, "utf-8"));
    expect(raw.pullRequests).toEqual([]);
  });

  it("propagates per-repo collection errors", async () => {
    const configPath = await writeConfig([{ owner: "openai", name: "evals" }]);
    const outputRoot = await tempDir();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("Internal Server Error", { status: 500 }));

    const result = await fetchStage(PERIOD, {
      configPath,
      fetchFn,
      env: { GITHUB_TOKEN: "ghp_test123" },
      now: new Date("2026-04-01T00:00:00.000Z"),
      outputRoot,
    });

    expect(result.rateLimited).toBeUndefined();
    expect(result.errors.map((e) => e.repository)).toEqual(["openai/evals"]);
    expect(result.errors[0]!.message).toMatch(/500/);
  });

  it("reports no failures on a clean (empty) collection", async () => {
    const configPath = await writeConfig([{ owner: "openai", name: "evals" }]);
    const outputRoot = await tempDir();
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { search: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await fetchStage(PERIOD, {
      configPath,
      fetchFn,
      env: { GITHUB_TOKEN: "ghp_test123" },
      now: new Date("2026-04-01T00:00:00.000Z"),
      outputRoot,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.rateLimited).toBeUndefined();
  });
});
