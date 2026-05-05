import { describe, expect, it } from "vitest";

import { loadRuntimeConfig, normalizePrivateKey } from "./runtime.js";
import { RuntimeConfigError } from "./errors.js";

describe("loadRuntimeConfig", () => {
  it("loads config with GITHUB_TOKEN", () => {
    const runtimeConfig = loadRuntimeConfig({
      GITHUB_TOKEN: "ghp_abc123",
    }, new Date("2026-04-01T00:00:00.000Z"));

    expect(runtimeConfig.githubToken).toBe("ghp_abc123");
    expect(runtimeConfig.githubAppId).toBeNull();
    expect(runtimeConfig.lookbackDays).toBe(90);
    expect(runtimeConfig.firstReviewThresholdHours).toBe(48);
    expect(runtimeConfig.cutoffDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("loads config with GitHub App credentials", () => {
    const runtimeConfig = loadRuntimeConfig({
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: "line1\\nline2",
      GITHUB_APP_INSTALLATION_ID: "456",
    }, new Date("2026-04-01T00:00:00.000Z"));

    expect(runtimeConfig.githubToken).toBeNull();
    expect(runtimeConfig.githubAppId).toBe("123");
    expect(runtimeConfig.githubAppPrivateKey).toBe("line1\nline2");
    expect(runtimeConfig.githubAppInstallationId).toBe(456);
    expect(runtimeConfig.cutoffDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("prefers GITHUB_TOKEN when both are provided", () => {
    const runtimeConfig = loadRuntimeConfig({
      GITHUB_TOKEN: "ghp_abc123",
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: "key",
      GITHUB_APP_INSTALLATION_ID: "456",
    }, new Date("2026-04-01T00:00:00.000Z"));

    expect(runtimeConfig.githubToken).toBe("ghp_abc123");
    expect(runtimeConfig.githubAppId).toBe("123");
  });

  it("fails when no auth credentials are provided", () => {
    expect(() => loadRuntimeConfig({})).toThrow(RuntimeConfigError);
  });

  it("fails when only partial GitHub App credentials are provided", () => {
    expect(() => loadRuntimeConfig({
      GITHUB_APP_ID: "123",
    })).toThrow(RuntimeConfigError);
  });
});

describe("normalizePrivateKey", () => {
  it("preserves already-normalized keys", () => {
    expect(normalizePrivateKey("line1\nline2")).toBe("line1\nline2");
  });
});
