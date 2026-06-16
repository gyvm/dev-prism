import { describe, expect, it } from "vitest";

import { resolveScope } from "./scope.js";
import { exploreHref, scopeFromSearchParams, scopeToSearchParams } from "./scope-url.js";

describe("scope URL serialization", () => {
  it("omits defaults to keep the URL clean", () => {
    const params = scopeToSearchParams(resolveScope());
    expect(params.toString()).toBe("");
  });

  it("serializes only non-default fields", () => {
    const scope = resolveScope({
      from: new Date("2026-04-20T00:00:00.000Z"),
      to: new Date("2026-04-27T00:00:00.000Z"),
      repos: ["openai/codex"],
      includeBots: false,
      grain: "day",
    });
    const params = scopeToSearchParams(scope);
    expect(params.get("from")).toBe("2026-04-20T00:00:00.000Z");
    expect(params.get("to")).toBe("2026-04-27T00:00:00.000Z");
    expect(params.get("repos")).toBe("openai/codex");
    expect(params.get("bots")).toBe("exclude");
    expect(params.get("grain")).toBe("day");
    expect(params.has("users")).toBe(false);
  });

  it("round-trips an arbitrary scope exactly", () => {
    const scope = resolveScope({
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.000Z"),
      repos: ["a/b", "c/d"],
      users: ["alice", "bob"],
      includeBots: false,
      grain: "month",
    });
    const restored = scopeFromSearchParams(scopeToSearchParams(scope));
    expect({ ...restored, from: restored.from?.toISOString(), to: restored.to?.toISOString() }).toEqual({
      ...scope,
      from: scope.from?.toISOString(),
      to: scope.to?.toISOString(),
    });
  });

  it("round-trips the default scope", () => {
    const restored = scopeFromSearchParams(scopeToSearchParams(resolveScope()));
    expect(restored).toEqual(resolveScope());
  });

  it("parses from a raw query string and rejects invalid values", () => {
    const scope = scopeFromSearchParams(new URLSearchParams("repos=x/y&bots=exclude&grain=month"));
    expect(scope.repos).toEqual(["x/y"]);
    expect(scope.includeBots).toBe(false);
    expect(scope.grain).toBe("month");
    expect(() => scopeFromSearchParams(new URLSearchParams("grain=year"))).toThrow(/grain/);
    expect(() => scopeFromSearchParams(new URLSearchParams("bots=maybe"))).toThrow(/bots/);
  });

  it("builds an Explore deep-link href", () => {
    const scope = resolveScope({ from: new Date("2026-04-20T00:00:00.000Z"), to: new Date("2026-04-27T00:00:00.000Z") });
    expect(exploreHref(scope)).toBe("/explore?from=2026-04-20T00%3A00%3A00.000Z&to=2026-04-27T00%3A00%3A00.000Z");
    expect(exploreHref(resolveScope())).toBe("/explore");
  });
});
