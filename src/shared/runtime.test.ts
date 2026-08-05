import { describe, expect, it } from "vitest";

import { loadRuntimeConfig, normalizePrivateKey, parseInstallationIds } from "./runtime.js";
import { RuntimeConfigError } from "./errors.js";

describe("loadRuntimeConfig", () => {
  it("loads config with GITHUB_TOKEN", () => {
    const runtimeConfig = loadRuntimeConfig({
      GITHUB_TOKEN: "ghp_abc123",
    }, new Date("2026-04-01T00:00:00.000Z"));

    expect(runtimeConfig.githubToken).toBe("ghp_abc123");
    expect(runtimeConfig.githubAppId).toBeNull();
    expect(runtimeConfig.lookbackDays).toBe(30);
    expect(runtimeConfig.firstReviewThresholdHours).toBe(48);
    expect(runtimeConfig.cutoffDate.toISOString()).toBe("2026-03-02T00:00:00.000Z");
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
    expect(runtimeConfig.githubAppInstallationIds).toEqual({});
    expect(runtimeConfig.cutoffDate.toISOString()).toBe("2026-03-02T00:00:00.000Z");
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

  it("loads owner-specific GitHub App installation IDs", () => {
    const runtimeConfig = loadRuntimeConfig({
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: "key",
      GITHUB_APP_INSTALLATION_IDS: "Acme=456\nsubsidiary=789",
    });

    expect(runtimeConfig.githubAppInstallationId).toBeNull();
    expect(runtimeConfig.githubAppInstallationIds).toEqual({
      acme: 456,
      subsidiary: 789,
    });
  });

  it("fails when no auth credentials are provided", () => {
    expect(() => loadRuntimeConfig({})).toThrow(RuntimeConfigError);
  });

  it("fails when only partial GitHub App credentials are provided", () => {
    expect(() => loadRuntimeConfig({
      GITHUB_APP_ID: "123",
    })).toThrow(RuntimeConfigError);
  });

  it("fails when an installation map entry is malformed", () => {
    expect(() => loadRuntimeConfig({
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: "key",
      GITHUB_APP_INSTALLATION_IDS: "acme:not-an-id",
    })).toThrow(/owner=installation_id/);
  });

  it("fails when the installation map has no entries", () => {
    expect(() => loadRuntimeConfig({
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: "key",
      GITHUB_APP_INSTALLATION_IDS: ",",
    })).toThrow(/at least one owner=installation_id/);
  });
});

describe("normalizePrivateKey", () => {
  it("preserves already-normalized keys", () => {
    expect(normalizePrivateKey("line1\nline2")).toBe("line1\nline2");
  });
});

describe("parseInstallationIds", () => {
  it("accepts comma-separated entries", () => {
    expect(parseInstallationIds("acme=1, subsidiary=2")).toEqual({
      acme: 1,
      subsidiary: 2,
    });
  });

  it("rejects duplicate owners case-insensitively", () => {
    expect(() => parseInstallationIds("Acme=1\nacme=2")).toThrow(/duplicate owner/);
  });
});
