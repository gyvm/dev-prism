import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makePr } from "../test-fixtures.js";
import type { NormalizedActor, NormalizedPullRequest } from "../shared/types.js";
import { buildDwhFromPullRequests } from "../warehouse/build.js";
import { generateReports } from "../report/frozen-report.js";
import { resolveScope } from "../analyses/scope.js";
import { parseArgs, tasksFromOptions } from "./dwh-report.js";

describe("dwh-report parseArgs", () => {
  it("parses on-demand flags", () => {
    const options = parseArgs([
      "--from", "2026-04-20", "--to", "2026-04-27",
      "--repos", "openai/codex, openai/evals", "--grain", "day", "--no-bots", "--title", "Ad hoc",
    ]);
    expect(options.from?.toISOString()).toBe("2026-04-20T00:00:00.000Z");
    expect(options.repos).toEqual(["openai/codex", "openai/evals"]);
    expect(options.grain).toBe("day");
    expect(options.includeBots).toBe(false);
    expect(options.title).toBe("Ad hoc");
  });

  it("rejects bad dates, grains, and unknown flags", () => {
    expect(() => parseArgs(["--from", "nope"])).toThrow(/YYYY-MM-DD/);
    expect(() => parseArgs(["--grain", "year"])).toThrow(/day\|week\|month/);
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown argument/);
  });
});

describe("dwh-report tasksFromOptions", () => {
  it("builds a single on-demand task", async () => {
    const options = parseArgs(["--from", "2026-04-20", "--to", "2026-04-27", "--title", "T"]);
    const tasks = await tasksFromOptions(options, new Date("2026-04-27T00:00:00.000Z"));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.title).toBe("T");
    expect(tasks[0]!.scope.from?.toISOString()).toBe("2026-04-20T00:00:00.000Z");
  });

  it("expands declarative reports.toml definitions against now", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-rc-cli-"));
    try {
      const configPath = join(root, "reports.toml");
      await writeFile(configPath, `[[reports]]\ntitle = "Weekly"\nlookback_days = 7\n`, "utf8");
      const options = parseArgs(["--reports-config", configPath]);
      const tasks = await tasksFromOptions(options, new Date("2026-04-27T00:00:00.000Z"));
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.scope.from?.toISOString()).toBe("2026-04-20T00:00:00.000Z");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("errors when neither config nor from/to is given", async () => {
    await expect(tasksFromOptions(parseArgs([]), new Date())).rejects.toThrow(/--reports-config or both --from and --to/);
  });
});

describe("generateReports end-to-end", () => {
  const alice: NormalizedActor = { sourceNodeId: "U_alice", type: "User", login: "alice", slug: null, name: "Alice", url: null };

  function fixture(): NormalizedPullRequest {
    return makePr({
      repo: { owner: "openai", name: "codex", sourceNodeId: "R_1", visibility: "PRIVATE" },
      sourceNodeId: "PR_1",
      number: 1,
      title: "Feature",
      author: "alice",
      authorActor: alice,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-22T00:00:00.000Z",
      mergedAt: "2026-04-22T00:00:00.000Z",
      additions: 10,
      deletions: 1,
    });
  }

  it("writes report html, index.json, and the list page", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-insights-gen-"));
    const dwhDir = join(root, "dwh");
    const reportsDir = join(root, "reports");
    const indexHtmlPath = join(root, "dist", "index.html");
    try {
      await buildDwhFromPullRequests([fixture()], { dwhDir, botPatterns: [] });
      const scope = resolveScope({ from: new Date("2026-04-20T00:00:00.000Z"), to: new Date("2026-04-27T00:00:00.000Z") });
      const result = await generateReports({
        dwhDir,
        reportsDir,
        indexHtmlPath,
        tasks: [{ scope, title: "Weekly" }],
        generatedAt: new Date("2026-04-27T09:00:00.000Z"),
      });

      expect(result.ids).toHaveLength(1);
      const reportHtml = await readFile(join(reportsDir, `${result.ids[0]}.html`), "utf8");
      expect(reportHtml).toContain("<!doctype html>");
      const index = JSON.parse(await readFile(join(reportsDir, "index.json"), "utf8"));
      expect(index).toHaveLength(1);
      const listHtml = await readFile(indexHtmlPath, "utf8");
      expect(listHtml).toContain("Weekly");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
