import { describe, expect, it } from "vitest";

import { ConfigError } from "../shared/errors.js";
import { parseReportsConfig, resolveReportScope } from "./reports-config.js";

describe("parseReportsConfig", () => {
  it("parses report definitions with defaults applied", () => {
    const defs = parseReportsConfig(`
[[reports]]
title = "All repos weekly"
lookback_days = 7

[[reports]]
title = "Team monthly"
cadence = "monthly"
lookback_days = 30
grain = "month"
include_bots = false
repos = ["openai/codex"]
`);

    expect(defs).toHaveLength(2);
    expect(defs[0]).toMatchObject({ title: "All repos weekly", cadence: "weekly", grain: "week" });
    expect(defs[0]!.include_bots).toBe(true);
    expect(defs[1]).toMatchObject({ cadence: "monthly", grain: "month", include_bots: false, repos: ["openai/codex"] });
  });

  it("returns an empty list when there are no reports", () => {
    expect(parseReportsConfig("")).toEqual([]);
  });

  it("rejects unknown keys and missing required fields", () => {
    expect(() => parseReportsConfig(`[[reports]]\ntitle = "x"\n`)).toThrow(ConfigError); // no lookback_days
    expect(() => parseReportsConfig(`[[reports]]\ntitle = "x"\nlookback_days = 7\nbogus = 1\n`)).toThrow(ConfigError);
  });

  it("rejects invalid TOML", () => {
    expect(() => parseReportsConfig("not = = toml")).toThrow(ConfigError);
  });
});

describe("resolveReportScope", () => {
  it("computes a window ending at now from lookback_days", () => {
    const def = parseReportsConfig(`[[reports]]\ntitle = "w"\nlookback_days = 7\n`)[0]!;
    const now = new Date("2026-04-27T00:00:00.000Z");
    const scope = resolveReportScope(def, now);

    expect(scope.to?.toISOString()).toBe("2026-04-27T00:00:00.000Z");
    expect(scope.from?.toISOString()).toBe("2026-04-20T00:00:00.000Z");
    expect(scope.grain).toBe("week");
    expect(scope.includeBots).toBe(true);
  });
});
