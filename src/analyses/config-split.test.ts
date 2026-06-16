import { describe, expect, it } from "vitest";

import type { UnifiedConfig } from "../shared/config.js";
import { buildTimeConfig, queryTimeConfig } from "./config-split.js";

const config: UnifiedConfig = {
  timezone: "UTC",
  repositories: [],
  limits: {
    maxPrs: 50,
    maxCommentsPerPr: 80,
    maxReviewThreadsPerPr: 60,
    maxFilesPerPr: 120,
    maxCommitsPerPr: 80,
    maxBodyLength: 4000,
  },
  ai: {},
  bots: { patterns: ["\\[bot\\]$", "dependabot"] },
};

describe("config split", () => {
  it("routes bot patterns to build-time config", () => {
    expect(buildTimeConfig(config)).toEqual({ botPatterns: ["\\[bot\\]$", "dependabot"] });
  });

  it("routes thresholds to query-time config", () => {
    expect(queryTimeConfig({ firstReviewThresholdHours: 24 })).toEqual({
      thresholds: { firstReviewThresholdHours: 24 },
    });
  });
});
