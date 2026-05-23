import { describe, expect, it } from "vitest";

import { createBotLoginMatcher } from "./bot.js";
import {
  DEFAULT_BOT_PATTERNS,
  DEFAULT_LIMITS,
  parseRepositoriesArg,
  resolveTimezone,
} from "./config.js";

describe("parseRepositoriesArg", () => {
  it("parses a concrete owner/name entry", () => {
    expect(parseRepositoriesArg("openai/codex")).toEqual([
      { kind: "concrete", owner: "openai", name: "codex" },
    ]);
  });

  it("parses a wildcard owner/* entry", () => {
    expect(parseRepositoriesArg("acme-corp/*")).toEqual([
      { kind: "wildcard", owner: "acme-corp" },
    ]);
  });

  it("parses a space- and comma-separated mix", () => {
    expect(parseRepositoriesArg("openai/codex, acme-corp/*  foo/bar")).toEqual([
      { kind: "concrete", owner: "openai", name: "codex" },
      { kind: "wildcard", owner: "acme-corp" },
      { kind: "concrete", owner: "foo", name: "bar" },
    ]);
  });

  it("rejects entries without a slash", () => {
    expect(() => parseRepositoriesArg("foo")).toThrow(/expected exactly one/i);
  });

  it("rejects entries with too many slashes", () => {
    expect(() => parseRepositoriesArg("foo/bar/baz")).toThrow(/expected exactly one/i);
  });

  it("rejects owner-side wildcard", () => {
    expect(() => parseRepositoriesArg("*/repo")).toThrow(
      /owner wildcard is not supported/i,
    );
  });

  it("rejects double wildcard", () => {
    expect(() => parseRepositoriesArg("*/*")).toThrow(
      /owner wildcard is not supported/i,
    );
  });

  it("rejects entries with empty name", () => {
    expect(() => parseRepositoriesArg("foo/")).toThrow(/name is empty/i);
  });

  it("rejects entries with invalid characters", () => {
    expect(() => parseRepositoriesArg("foo$bar/baz")).toThrow(/invalid characters/i);
  });

  it("rejects case-insensitive concrete duplicates", () => {
    expect(() => parseRepositoriesArg("OpenAI/Codex openai/codex")).toThrow(
      /duplicate entry/i,
    );
  });

  it("rejects duplicate wildcards for the same owner", () => {
    expect(() => parseRepositoriesArg("acme-corp/* ACME-CORP/*")).toThrow(
      /duplicate entry/i,
    );
  });

  it("rejects mixing wildcard with concrete entry for the same owner", () => {
    expect(() => parseRepositoriesArg("acme-corp/* acme-corp/repo")).toThrow(
      /mix wildcard.*with concrete/i,
    );
  });

  it("rejects an empty / whitespace-only input", () => {
    expect(() => parseRepositoriesArg("")).toThrow(/no repositories specified/i);
    expect(() => parseRepositoriesArg("   ")).toThrow(/no repositories specified/i);
  });
});

describe("resolveTimezone", () => {
  it("defaults to UTC when absent or blank", () => {
    expect(resolveTimezone()).toBe("UTC");
    expect(resolveTimezone("")).toBe("UTC");
    expect(resolveTimezone("   ")).toBe("UTC");
  });

  it("accepts a valid IANA timezone", () => {
    expect(resolveTimezone("Asia/Tokyo")).toBe("Asia/Tokyo");
  });

  it("rejects an invalid timezone", () => {
    expect(() => resolveTimezone("Not/AZone")).toThrow(/invalid iana timezone/i);
  });
});

describe("default constants", () => {
  it("exposes positive integer fetch limits", () => {
    for (const value of Object.values(DEFAULT_LIMITS)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it("flags common bot logins via DEFAULT_BOT_PATTERNS", () => {
    const isBot = createBotLoginMatcher(DEFAULT_BOT_PATTERNS);
    expect(isBot("dependabot[bot]")).toBe(true);
    expect(isBot("github-actions[bot]")).toBe(true);
    expect(isBot("renovate")).toBe(true);
    expect(isBot("copilot")).toBe(true);
    expect(isBot("octocat")).toBe(false);
  });
});
