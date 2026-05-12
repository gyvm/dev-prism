import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIMITS,
  loadRepoConfig,
  loadUnifiedConfig,
} from "./config.js";

async function writeTempConfig(contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "gh-insights-config-"));
  const filePath = join(directory, "config.toml");
  await writeFile(filePath, contents, "utf8");
  return filePath;
}

describe("loadRepoConfig", () => {
  it("parses a concrete owner/name entry", async () => {
    const filePath = await writeTempConfig(`[repositories]
include = ["openai/codex"]
`);

    await expect(loadRepoConfig(filePath)).resolves.toEqual({
      repositories: [{ kind: "concrete", owner: "openai", name: "codex" }],
      timezone: "UTC",
    });
  });

  it("parses a wildcard owner/* entry", async () => {
    const filePath = await writeTempConfig(`[repositories]
include = ["acme-corp/*"]
`);

    await expect(loadRepoConfig(filePath)).resolves.toEqual({
      repositories: [{ kind: "wildcard", owner: "acme-corp" }],
      timezone: "UTC",
    });
  });

  it("parses a mix of concrete and wildcard entries", async () => {
    const filePath = await writeTempConfig(`[repositories]
include = ["openai/codex", "acme-corp/*"]
`);

    await expect(loadRepoConfig(filePath)).resolves.toEqual({
      repositories: [
        { kind: "concrete", owner: "openai", name: "codex" },
        { kind: "wildcard", owner: "acme-corp" },
      ],
      timezone: "UTC",
    });
  });

  it("reads [general].timezone", async () => {
    const filePath = await writeTempConfig(`[general]
timezone = "Asia/Tokyo"

[repositories]
include = ["openai/codex"]
`);

    await expect(loadRepoConfig(filePath)).resolves.toEqual({
      repositories: [{ kind: "concrete", owner: "openai", name: "codex" }],
      timezone: "Asia/Tokyo",
    });
  });

  it("rejects entries without a slash", async () => {
    const filePath = await writeTempConfig(`[repositories]
include = ["foo"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/expected exactly one/i);
  });

  it("rejects entries with too many slashes", async () => {
    const filePath = await writeTempConfig(`[repositories]
include = ["foo/bar/baz"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/expected exactly one/i);
  });

  it("rejects owner-side wildcard", async () => {
    const filePath = await writeTempConfig(`[repositories]
include = ["*/repo"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(
      /owner wildcard is not supported/i,
    );
  });

  it("rejects double wildcard", async () => {
    const filePath = await writeTempConfig(`[repositories]
include = ["*/*"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(
      /owner wildcard is not supported/i,
    );
  });

  it("rejects whitespace-only entries", async () => {
    const filePath = await writeTempConfig(`[repositories]
include = [" "]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/must not be empty/i);
  });

  it("rejects entries with empty name", async () => {
    const filePath = await writeTempConfig(`[repositories]
include = ["foo/"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/name is empty/i);
  });

  it("rejects entries with invalid characters", async () => {
    const filePath = await writeTempConfig(`[repositories]
include = ["foo bar/baz"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/invalid characters/i);
  });

  it("rejects case-insensitive concrete duplicates", async () => {
    const filePath = await writeTempConfig(`[repositories]
include = ["OpenAI/Codex", "openai/codex"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/duplicate entry/i);
  });

  it("rejects duplicate wildcards for the same owner", async () => {
    const filePath = await writeTempConfig(`[repositories]
include = ["acme-corp/*", "ACME-CORP/*"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/duplicate entry/i);
  });

  it("rejects mixing wildcard with concrete entry for the same owner", async () => {
    const filePath = await writeTempConfig(`[repositories]
include = ["acme-corp/*", "acme-corp/repo"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(
      /mixes wildcard.*with concrete/i,
    );
  });

  it("rejects empty repositories include", async () => {
    const filePath = await writeTempConfig(`[repositories]
include = []
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/at least one repository/i);
  });

  it("rejects the legacy top-level repositories array", async () => {
    const filePath = await writeTempConfig(`repositories = ["openai/codex"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/invalid/i);
  });

  it("throws ConfigError for nonexistent file", async () => {
    await expect(loadRepoConfig("/tmp/nonexistent-path/config.toml")).rejects.toThrow(
      /failed to read/i,
    );
  });

  it("throws ConfigError for invalid TOML", async () => {
    const filePath = await writeTempConfig("not valid toml = = =");

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/not valid TOML/i);
  });
});

describe("loadUnifiedConfig", () => {
  const baseConfig = `[repositories]
include = ["openai/codex"]
`;

  it("applies defaults when only [repositories] is present", async () => {
    const filePath = await writeTempConfig(baseConfig);
    const config = await loadUnifiedConfig(filePath);
    expect(config.repositories).toEqual([
      { kind: "concrete", owner: "openai", name: "codex" },
    ]);
    expect(config.timezone).toBe("UTC");
    expect(config.limits).toEqual(DEFAULT_LIMITS);
    expect(config.bots.patterns).toEqual([]);
    expect(config.ai.model).toBeUndefined();
  });

  it("loads [limits] overrides", async () => {
    const filePath = await writeTempConfig(`${baseConfig}
[limits]
maxPrs = 5
maxBodyLength = 100
`);
    const config = await loadUnifiedConfig(filePath);
    expect(config.limits.maxPrs).toBe(5);
    expect(config.limits.maxBodyLength).toBe(100);
    expect(config.limits.maxCommentsPerPr).toBe(DEFAULT_LIMITS.maxCommentsPerPr);
  });

  it("leaves ai.model unset when [ai] is absent", async () => {
    const filePath = await writeTempConfig(baseConfig);
    const config = await loadUnifiedConfig(filePath);
    expect(config.ai.model).toBeUndefined();
  });

  it("loads ai.model override", async () => {
    const filePath = await writeTempConfig(`${baseConfig}
[ai]
model = "claude-sonnet-4-5"
`);
    const config = await loadUnifiedConfig(filePath);
    expect(config.ai.model).toBe("claude-sonnet-4-5");
  });

  it("treats empty ai.model as unset", async () => {
    const filePath = await writeTempConfig(`${baseConfig}
[ai]
model = ""
`);
    const config = await loadUnifiedConfig(filePath);
    expect(config.ai.model).toBeUndefined();
  });

  it("loads bot patterns", async () => {
    const filePath = await writeTempConfig(`${baseConfig}
[bots]
patterns = ["^renovate$", "\\\\[bot\\\\]$"]
`);
    const config = await loadUnifiedConfig(filePath);
    expect(config.bots.patterns).toEqual(["^renovate$", "\\[bot\\]$"]);
  });

  it("rejects invalid bot pattern regex", async () => {
    const filePath = await writeTempConfig(`${baseConfig}
[bots]
patterns = ["["]
`);
    await expect(loadUnifiedConfig(filePath)).rejects.toThrow(/invalid regular expression/i);
  });
});
