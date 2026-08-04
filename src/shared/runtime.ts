import { z } from "zod";

import { RuntimeConfigError } from "./errors.js";
import type { RuntimeConfig } from "./types.js";

const runtimeSchema = z
  .object({
    GITHUB_TOKEN: z.string().trim().min(1).optional(),
    GITHUB_APP_ID: z.string().trim().min(1).optional(),
    GITHUB_APP_PRIVATE_KEY: z.string().trim().min(1).optional(),
    GITHUB_APP_INSTALLATION_ID: z.coerce.number().int().positive().optional(),
    GITHUB_APP_INSTALLATION_IDS: z.string().trim().min(1).optional(),
    GITHUB_API_URL: z.string().trim().min(1).optional(),
    LOOKBACK_DAYS: z.coerce.number().int().positive().default(30),
    FIRST_REVIEW_THRESHOLD_HOURS: z.coerce.number().int().positive().default(48),
  })
  .refine(
    (data) =>
      data.GITHUB_TOKEN !== undefined ||
      (data.GITHUB_APP_ID !== undefined &&
        data.GITHUB_APP_PRIVATE_KEY !== undefined &&
        (data.GITHUB_APP_INSTALLATION_ID !== undefined ||
          data.GITHUB_APP_INSTALLATION_IDS !== undefined)),
    {
      message:
        "Either GITHUB_TOKEN or GitHub App credentials (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_INSTALLATION_ID or GITHUB_APP_INSTALLATION_IDS) are required",
    },
  );

export function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

/**
 * Parse the optional multi-installation selector.
 *
 * The format is line-oriented so it can be stored directly in a GitHub Actions
 * multiline environment value: `acme=123` and `subsidiary=456`. Commas are
 * also accepted for local shell usage.
 */
export function parseInstallationIds(
  value: string | undefined,
): Readonly<Record<string, number>> {
  if (!value?.trim()) return {};

  const result: Record<string, number> = {};
  const entries = value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) {
    throw new RuntimeConfigError(
      "GITHUB_APP_INSTALLATION_IDS must contain at least one owner=installation_id entry",
    );
  }

  for (const entry of entries) {
    const separator = entry.indexOf("=");
    if (separator <= 0 || separator === entry.length - 1) {
      throw new RuntimeConfigError(
        `GITHUB_APP_INSTALLATION_IDS entry "${entry}" must use the format owner=installation_id`,
      );
    }

    const owner = entry.slice(0, separator).trim().toLowerCase();
    const rawInstallationId = entry.slice(separator + 1).trim();
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(owner)) {
      throw new RuntimeConfigError(
        `GITHUB_APP_INSTALLATION_IDS owner "${owner}" is not a valid GitHub owner`,
      );
    }

    const installationId = Number(rawInstallationId);
    if (!Number.isInteger(installationId) || installationId <= 0) {
      throw new RuntimeConfigError(
        `GITHUB_APP_INSTALLATION_IDS installation ID for "${owner}" must be a positive integer`,
      );
    }
    if (result[owner] !== undefined) {
      throw new RuntimeConfigError(
        `GITHUB_APP_INSTALLATION_IDS contains duplicate owner "${owner}"`,
      );
    }
    result[owner] = installationId;
  }

  return result;
}

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): RuntimeConfig {
  const emptyToUndefined = (val: string | undefined) =>
    val?.trim() ? val : undefined;

  const parsed = runtimeSchema.safeParse({
    GITHUB_TOKEN: emptyToUndefined(env.GITHUB_TOKEN),
    GITHUB_APP_ID: emptyToUndefined(env.GITHUB_APP_ID),
    GITHUB_APP_PRIVATE_KEY: emptyToUndefined(env.GITHUB_APP_PRIVATE_KEY),
    GITHUB_APP_INSTALLATION_ID: emptyToUndefined(
      env.GITHUB_APP_INSTALLATION_ID,
    ),
    GITHUB_APP_INSTALLATION_IDS: emptyToUndefined(env.GITHUB_APP_INSTALLATION_IDS),
    GITHUB_API_URL: emptyToUndefined(env.GITHUB_API_URL),
    LOOKBACK_DAYS: env.LOOKBACK_DAYS ?? 30,
    FIRST_REVIEW_THRESHOLD_HOURS: env.FIRST_REVIEW_THRESHOLD_HOURS ?? 48,
  });

  if (!parsed.success) {
    throw new RuntimeConfigError(
      parsed.error.issues.map((issue) => issue.message).join(", "),
    );
  }

  const githubAppInstallationIds = parseInstallationIds(
    parsed.data.GITHUB_APP_INSTALLATION_IDS,
  );

  const cutoffDate = new Date(now);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - parsed.data.LOOKBACK_DAYS);

  return {
    githubToken: parsed.data.GITHUB_TOKEN ?? null,
    githubAppId: parsed.data.GITHUB_APP_ID ?? null,
    githubAppPrivateKey: parsed.data.GITHUB_APP_PRIVATE_KEY
      ? normalizePrivateKey(parsed.data.GITHUB_APP_PRIVATE_KEY)
      : null,
    githubAppInstallationId: parsed.data.GITHUB_APP_INSTALLATION_ID ?? null,
    githubAppInstallationIds,
    githubApiUrl: parsed.data.GITHUB_API_URL ?? null,
    lookbackDays: parsed.data.LOOKBACK_DAYS,
    firstReviewThresholdHours: parsed.data.FIRST_REVIEW_THRESHOLD_HOURS,
    cutoffDate,
  };
}
