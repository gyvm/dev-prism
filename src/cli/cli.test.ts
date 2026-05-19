import { describe, expect, it } from "vitest";

import { parseArgs } from "./report.js";

describe("report parseArgs", () => {
  it("defaults to the run subcommand and parses --week into a Date at noon UTC", () => {
    const result = parseArgs(["--week", "2026-04-27"]);
    expect(result.subcommand).toBe("run");
    expect(result.options.now?.toISOString()).toBe("2026-04-27T12:00:00.000Z");
    expect(result.options.skipAi).toBeUndefined();
  });

  it("recognizes a subcommand as the first positional argument", () => {
    const result = parseArgs(["fetch", "--week", "2026-04-27"]);
    expect(result.subcommand).toBe("fetch");
    expect(result.options.now?.toISOString()).toBe("2026-04-27T12:00:00.000Z");
  });

  it("throws on unknown subcommand", () => {
    expect(() => parseArgs(["bogus"])).toThrow(/Unknown subcommand/);
  });

  it("throws on malformed --week value", () => {
    expect(() => parseArgs(["--week", "2026/4/27"])).toThrow(/YYYY-MM-DD/);
  });

  it("throws when --week has no value", () => {
    expect(() => parseArgs(["--week"])).toThrow(/--week requires/);
  });

  it("throws on semantically invalid dates that pass the regex", () => {
    expect(() => parseArgs(["--week", "2026-02-30"])).toThrow(/could not parse/);
    expect(() => parseArgs(["--week", "2026-13-01"])).toThrow(/could not parse/);
  });

  it("captures --skill and --write for analyze", () => {
    const result = parseArgs([
      "analyze",
      "--skill",
      "project-progress",
      "--write",
      "-",
    ]);
    expect(result.subcommand).toBe("analyze");
    expect(result.options.skill).toBe("project-progress");
    expect(result.options.writePath).toBe("-");
  });
});
