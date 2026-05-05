import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAPS,
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
    const filePath = await writeTempConfig(`repositories = ["openai/codex"]
`);

    await expect(loadRepoConfig(filePath)).resolves.toEqual({
      repositories: [{ kind: "concrete", owner: "openai", name: "codex" }],
      timezone: "UTC",
    });
  });

  it("parses a wildcard owner/* entry", async () => {
    const filePath = await writeTempConfig(`repositories = ["acme-corp/*"]
`);

    await expect(loadRepoConfig(filePath)).resolves.toEqual({
      repositories: [{ kind: "wildcard", owner: "acme-corp" }],
      timezone: "UTC",
    });
  });

  it("parses a mix of concrete and wildcard entries", async () => {
    const filePath = await writeTempConfig(
      `repositories = ["openai/codex", "acme-corp/*"]
`,
    );

    await expect(loadRepoConfig(filePath)).resolves.toEqual({
      repositories: [
        { kind: "concrete", owner: "openai", name: "codex" },
        { kind: "wildcard", owner: "acme-corp" },
      ],
      timezone: "UTC",
    });
  });

  it("rejects entries without a slash", async () => {
    const filePath = await writeTempConfig(`repositories = ["foo"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/expected exactly one/i);
  });

  it("rejects entries with too many slashes", async () => {
    const filePath = await writeTempConfig(`repositories = ["foo/bar/baz"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/expected exactly one/i);
  });

  it("rejects owner-side wildcard", async () => {
    const filePath = await writeTempConfig(`repositories = ["*/repo"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(
      /owner wildcard is not supported/i,
    );
  });

  it("rejects double wildcard", async () => {
    const filePath = await writeTempConfig(`repositories = ["*/*"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(
      /owner wildcard is not supported/i,
    );
  });

  it("rejects whitespace-only entries", async () => {
    const filePath = await writeTempConfig(`repositories = [" "]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/must not be empty/i);
  });

  it("rejects entries with empty name", async () => {
    const filePath = await writeTempConfig(`repositories = ["foo/"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/name is empty/i);
  });

  it("rejects entries with invalid characters", async () => {
    const filePath = await writeTempConfig(`repositories = ["foo bar/baz"]
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/invalid characters/i);
  });

  it("rejects case-insensitive concrete duplicates", async () => {
    const filePath = await writeTempConfig(
      `repositories = ["OpenAI/Codex", "openai/codex"]
`,
    );

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/duplicate entry/i);
  });

  it("rejects duplicate wildcards for the same owner", async () => {
    const filePath = await writeTempConfig(
      `repositories = ["acme-corp/*", "ACME-CORP/*"]
`,
    );

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/duplicate entry/i);
  });

  it("rejects mixing wildcard with concrete entry for the same owner", async () => {
    const filePath = await writeTempConfig(
      `repositories = ["acme-corp/*", "acme-corp/repo"]
`,
    );

    await expect(loadRepoConfig(filePath)).rejects.toThrow(
      /mixes wildcard.*with concrete/i,
    );
  });

  it("rejects empty repositories array", async () => {
    const filePath = await writeTempConfig(`repositories = []
`);

    await expect(loadRepoConfig(filePath)).rejects.toThrow(/at least one repository/i);
  });

  it("rejects the legacy [[repositories]] table-array format", async () => {
    const filePath = await writeTempConfig(
      `[[repositories]]
owner = "openai"
name  = "codex"
`,
    );

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
  const baseConfig = `repositories = ["openai/codex"]
`;

  it("defaults analyses to empty disabled list and overrides", async () => {
    const filePath = await writeTempConfig(baseConfig);
    const config = await loadUnifiedConfig(filePath);
    expect(config.repositories).toEqual([
      { kind: "concrete", owner: "openai", name: "codex" },
    ]);
    expect(config.analyses.disabled).toEqual([]);
    expect(config.analyses.overrides).toEqual({});
    expect(config.caps).toEqual(DEFAULT_CAPS);
    expect(config.actors.botLoginPatterns).toEqual([]);
  });

  it("loads disabled list and overrides", async () => {
    const filePath = await writeTempConfig(`${baseConfig}
[analyses]
disabled = ["03_debated-prs", "02_follow-up-prs"]

[analyses.overrides]
"dora-metrics" = { firstReviewThresholdHours = 24 }
`);
    const config = await loadUnifiedConfig(filePath);
    expect(config.analyses.disabled).toEqual(["03_debated-prs", "02_follow-up-prs"]);
    expect(config.analyses.overrides).toEqual({
      "dora-metrics": { firstReviewThresholdHours: 24 },
    });
  });

  it("rejects non-string entries in disabled", async () => {
    const filePath = await writeTempConfig(`${baseConfig}
[analyses]
disabled = [1, 2]
`);
    await expect(loadUnifiedConfig(filePath)).rejects.toThrow(/invalid/i);
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

  it("loads actor bot login patterns", async () => {
    const filePath = await writeTempConfig(`${baseConfig}
[actors]
botLoginPatterns = ["^renovate$", "\\\\[bot\\\\]$"]
`);
    const config = await loadUnifiedConfig(filePath);
    expect(config.actors.botLoginPatterns).toEqual(["^renovate$", "\\[bot\\]$"]);
  });

  it("rejects invalid actor bot login patterns", async () => {
    const filePath = await writeTempConfig(`${baseConfig}
[actors]
botLoginPatterns = ["["]
`);
    await expect(loadUnifiedConfig(filePath)).rejects.toThrow(/invalid regular expression/i);
  });
});
