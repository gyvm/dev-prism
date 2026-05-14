import { describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "./runtime.js";
import { RuntimeConfigError } from "./errors.js";

describe("loadRuntimeConfig", () => {
  it("loads config with GITHUB_TOKEN", () => {
    const runtimeConfig = loadRuntimeConfig({
      GITHUB_TOKEN: "ghp_abc123",
    }, new Date("2026-04-01T00:00:00.000Z"));

    expect(runtimeConfig.githubToken).toBe("ghp_abc123");
    expect(runtimeConfig.lookbackDays).toBe(90);
    expect(runtimeConfig.firstReviewThresholdHours).toBe(48);
    expect(runtimeConfig.cutoffDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("fails when GITHUB_TOKEN is not provided", () => {
    expect(() => loadRuntimeConfig({})).toThrow(RuntimeConfigError);
  });

  it("fails when GITHUB_TOKEN is empty string", () => {
    expect(() => loadRuntimeConfig({ GITHUB_TOKEN: "" })).toThrow(RuntimeConfigError);
  });

  it("fails when GITHUB_TOKEN is whitespace only", () => {
    expect(() => loadRuntimeConfig({ GITHUB_TOKEN: "   " })).toThrow(RuntimeConfigError);
  });
});
