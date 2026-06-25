import { describe, expect, it } from "vitest";

import { scopeFromUrl } from "./explore.js";

const NOW = new Date("2026-06-17T00:00:00.000Z");

describe("scopeFromUrl", () => {
  it("fills a default 365-day window ending at now when the URL has no dates", () => {
    const scope = scopeFromUrl("", NOW);
    expect(scope.to?.toISOString()).toBe("2026-06-17T00:00:00.000Z");
    expect(scope.from?.toISOString()).toBe("2025-06-17T00:00:00.000Z");
    expect(scope.grain).toBe("week");
    expect(scope.includeBots).toBe(true);
  });

  it("uses explicit from/to from the URL", () => {
    const scope = scopeFromUrl("?from=2026-01-01T00:00:00.000Z&to=2026-03-31T00:00:00.000Z", NOW);
    expect(scope.from?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(scope.to?.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });

  it("carries non-date filters and still defaults the window", () => {
    const scope = scopeFromUrl("?bots=exclude&grain=month&repos=gyvm/dev-prism&users=gyvm", NOW);
    expect(scope.includeBots).toBe(false);
    expect(scope.grain).toBe("month");
    expect(scope.repos).toEqual(["gyvm/dev-prism"]);
    expect(scope.users).toEqual(["gyvm"]);
    // window defaulted since no from/to in URL
    expect(scope.to?.toISOString()).toBe("2026-06-17T00:00:00.000Z");
    expect(scope.from?.toISOString()).toBe("2025-06-17T00:00:00.000Z");
  });

  it("derives `from` relative to an explicit `to`", () => {
    const scope = scopeFromUrl("?to=2026-02-01T00:00:00.000Z", NOW);
    expect(scope.to?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(scope.from?.toISOString()).toBe("2025-02-01T00:00:00.000Z");
  });
});
