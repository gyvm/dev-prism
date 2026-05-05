import { describe, expect, it } from "vitest";

import { parseArgs } from "./collect.js";
import { parseArgs as parseReportArgs } from "./report.js";

describe("parseArgs", () => {
  it("parses --json flag", () => {
    expect(parseArgs(["--json"])).toEqual({ outputJson: true });
  });

  it("parses --config with value", () => {
    expect(parseArgs(["--config", "custom/repos.json"])).toEqual({
      outputJson: false,
      configPath: "custom/repos.json",
    });
  });

  it("parses combined flags", () => {
    expect(parseArgs(["--config", "custom/repos.json", "--json"])).toEqual({
      outputJson: true,
      configPath: "custom/repos.json",
    });
  });

  it("returns defaults with no arguments", () => {
    expect(parseArgs([])).toEqual({ outputJson: false });
  });

  it("throws on --config without a path", () => {
    expect(() => parseArgs(["--config"])).toThrow(/--config requires a path/);
  });

  it("throws on unknown arguments", () => {
    expect(() => parseArgs(["--unknown"])).toThrow(/unknown argument/i);
  });
});

describe("report parseArgs", () => {
  it("parses --week into a Date at noon UTC", () => {
    const result = parseReportArgs(["--week", "2026-04-27"]);
    expect(result.now?.toISOString()).toBe("2026-04-27T12:00:00.000Z");
    expect(result.skipAi).toBe(false);
  });

  it("throws on malformed --week value", () => {
    expect(() => parseReportArgs(["--week", "2026/4/27"])).toThrow(
      /YYYY-MM-DD/,
    );
  });

  it("throws when --week has no value", () => {
    expect(() => parseReportArgs(["--week"])).toThrow(/--week requires/);
  });

  it("throws on semantically invalid dates that pass the regex", () => {
    expect(() => parseReportArgs(["--week", "2026-02-30"])).toThrow(
      /could not parse/,
    );
    expect(() => parseReportArgs(["--week", "2026-13-01"])).toThrow(
      /could not parse/,
    );
  });
});
