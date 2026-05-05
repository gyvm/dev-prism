import { z } from "zod";

import { RuntimeConfigError } from "./errors.js";
import type { RuntimeConfig } from "./types.js";

const runtimeSchema = z
  .object({
    GITHUB_TOKEN: z.string().trim().min(1).optional(),
    GITHUB_APP_ID: z.string().trim().min(1).optional(),
    GITHUB_APP_PRIVATE_KEY: z.string().trim().min(1).optional(),
    GITHUB_APP_INSTALLATION_ID: z.coerce.number().int().positive().optional(),
    LOOKBACK_DAYS: z.coerce.number().int().positive().default(90),
    FIRST_REVIEW_THRESHOLD_HOURS: z.coerce.number().int().positive().default(48),
  })
  .refine(
    (data) =>
      data.GITHUB_TOKEN !== undefined ||
      (data.GITHUB_APP_ID !== undefined &&
        data.GITHUB_APP_PRIVATE_KEY !== undefined &&
        data.GITHUB_APP_INSTALLATION_ID !== undefined),
    {
      message:
        "Either GITHUB_TOKEN or all three GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_INSTALLATION_ID are required",
    },
  );

export function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
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
    LOOKBACK_DAYS: env.LOOKBACK_DAYS ?? 90,
    FIRST_REVIEW_THRESHOLD_HOURS: env.FIRST_REVIEW_THRESHOLD_HOURS ?? 48,
  });

  if (!parsed.success) {
    throw new RuntimeConfigError(
      parsed.error.issues.map((issue) => issue.message).join(", "),
    );
  }

  const cutoffDate = new Date(now);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - parsed.data.LOOKBACK_DAYS);

  return {
    githubToken: parsed.data.GITHUB_TOKEN ?? null,
    githubAppId: parsed.data.GITHUB_APP_ID ?? null,
    githubAppPrivateKey: parsed.data.GITHUB_APP_PRIVATE_KEY
      ? normalizePrivateKey(parsed.data.GITHUB_APP_PRIVATE_KEY)
      : null,
    githubAppInstallationId: parsed.data.GITHUB_APP_INSTALLATION_ID ?? null,
    lookbackDays: parsed.data.LOOKBACK_DAYS,
    firstReviewThresholdHours: parsed.data.FIRST_REVIEW_THRESHOLD_HOURS,
    cutoffDate,
  };
}
