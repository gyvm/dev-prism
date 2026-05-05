import { describe, expect, it } from "vitest";

import {
  errored,
  noData,
  NoDataError,
  ok,
  runWithFailure,
  skipped,
} from "./failure.js";
import type { AnalysisDescriptor } from "./types.js";

const desc: AnalysisDescriptor = {
  id: "test",
  type: "compute",
  renderer: "metric-cards",
  enabled: true,
};

describe("pipeline failure helpers", () => {
  it("ok wraps data", () => {
    expect(ok(desc, { x: 1 })).toEqual({
      id: "test",
      format: "json",
      renderer: "metric-cards",
      status: "ok",
      data: { x: 1 },
    });
  });

  it("noData carries reason", () => {
    expect(noData(desc, "no PRs")).toMatchObject({
      status: "no-data",
      reason: "no PRs",
    });
  });

  it("skipped carries reason", () => {
    expect(skipped(desc, "disabled")).toMatchObject({
      status: "skipped",
      reason: "disabled",
    });
  });

  it("errored maps Error to error status with stack", () => {
    const result = errored(desc, new Error("boom"));
    expect(result.status).toBe("error");
    expect(result.reason).toBe("boom");
    expect(result.stack).toBeDefined();
  });

  it("errored maps NoDataError to no-data status", () => {
    const result = errored(desc, new NoDataError("empty input"));
    expect(result).toMatchObject({ status: "no-data", reason: "empty input" });
  });

  it("runWithFailure converts thrown error to error status", async () => {
    const result = await runWithFailure(desc, () => {
      throw new Error("explode");
    });
    expect(result.status).toBe("error");
  });

  it("runWithFailure passes through ok", async () => {
    const result = await runWithFailure(desc, async () => 42);
    expect(result).toMatchObject({ status: "ok", data: 42 });
  });

  it("runWithFailure converts NoDataError to no-data", async () => {
    const result = await runWithFailure(desc, () => {
      throw new NoDataError("nothing");
    });
    expect(result).toMatchObject({ status: "no-data", reason: "nothing" });
  });
});
