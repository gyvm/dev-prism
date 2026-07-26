import { describe, expect, it } from "vitest";

import { resolveScope } from "../../analyses/scope.js";
import { buildStageDrilldownHref, parseStageSort } from "./stage-drilldown-url.js";

describe("stage drilldown URL", () => {
  it("carries the scope and the stage sort onto the timeline view", () => {
    const scope = resolveScope({
      from: new Date("2026-04-20T00:00:00.000Z"),
      to: new Date("2026-04-27T00:00:00.000Z"),
      repos: ["x/y"],
    });
    const href = buildStageDrilldownHref(scope, "open_to_review");
    expect(href).toContain("explore/timeline/?");
    const params = new URLSearchParams(href.slice(href.indexOf("?")));
    expect(params.get("sort")).toBe("open_to_review");
    expect(params.get("dir")).toBe("desc");
    expect(params.get("repos")).toBe("x/y");
    expect(params.get("from")).toBe("2026-04-20T00:00:00.000Z");
  });

  it("round-trips every stage key the funnel can emit", () => {
    for (const key of ["commit_to_open", "open_to_review", "review_to_approve", "approve_to_merge"] as const) {
      const href = buildStageDrilldownHref(resolveScope(), key);
      expect(parseStageSort(href.slice(href.indexOf("?")))).toEqual({ key, desc: true });
    }
  });

  it("accepts the table's own non-stage sort keys", () => {
    expect(parseStageSort("?sort=sizeLines&dir=asc")).toEqual({ key: "sizeLines", desc: false });
    expect(parseStageSort("?sort=mergedAt&dir=desc")).toEqual({ key: "mergedAt", desc: true });
  });

  it("falls back to the table's default for a missing or unknown sort", () => {
    expect(parseStageSort("")).toBeUndefined();
    expect(parseStageSort("?from=2026-04-20T00:00:00.000Z")).toBeUndefined();
    expect(parseStageSort("?sort=drop%20table&dir=desc")).toBeUndefined();
  });

  it("defaults to descending, since the drilldown means 'longest first'", () => {
    expect(parseStageSort("?sort=open_to_review")).toEqual({ key: "open_to_review", desc: true });
    expect(parseStageSort("?sort=open_to_review&dir=sideways")).toEqual({
      key: "open_to_review",
      desc: true,
    });
  });
});
