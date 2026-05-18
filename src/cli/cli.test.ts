import { describe, expect, it } from "vitest";

import { parseArgs as parseReportArgs } from "./report.js";

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
