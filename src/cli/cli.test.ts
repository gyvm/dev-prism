import { describe, expect, it } from "vitest";

import { parseArgs } from "./collect.js";
import { parseArgs as parseDwhBuildArgs } from "./dwh-build.js";

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

describe("dwh-build parseArgs", () => {
  it("parses config and dwh-dir", () => {
    expect(parseDwhBuildArgs(["--config", "config.test.toml", "--dwh-dir", "tmp/dwh"])).toEqual({
      configPath: "config.test.toml",
      dwhDir: "tmp/dwh",
    });
  });

  it("returns defaults with no arguments", () => {
    expect(parseDwhBuildArgs([])).toEqual({});
  });

  it("throws when --dwh-dir has no value", () => {
    expect(() => parseDwhBuildArgs(["--dwh-dir"])).toThrow(/--dwh-dir requires/);
  });

  it("parses --from into a UTC midnight Date", () => {
    expect(parseDwhBuildArgs(["--from", "2026-01-15"])).toEqual({
      from: new Date("2026-01-15T00:00:00.000Z"),
    });
  });

  it("rejects a malformed --from", () => {
    expect(() => parseDwhBuildArgs(["--from", "2026/01/15"])).toThrow(/--from expects YYYY-MM-DD/);
  });

  it("rejects a calendar-invalid --from instead of rolling it over", () => {
    expect(() => parseDwhBuildArgs(["--from", "2026-02-30"])).toThrow(/not a valid calendar date/);
  });
});
