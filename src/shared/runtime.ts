import { z } from "zod";

import { RuntimeConfigError } from "./errors.js";
import type { RuntimeConfig } from "./types.js";

const runtimeSchema = z.object({
  GITHUB_TOKEN: z.string().trim().min(1),
  LOOKBACK_DAYS: z.coerce.number().int().positive().default(90),
  FIRST_REVIEW_THRESHOLD_HOURS: z.coerce.number().int().positive().default(48),
});

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): RuntimeConfig {
  const emptyToUndefined = (val: string | undefined) =>
    val?.trim() ? val : undefined;

  const parsed = runtimeSchema.safeParse({
    GITHUB_TOKEN: emptyToUndefined(env.GITHUB_TOKEN),
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
    githubToken: parsed.data.GITHUB_TOKEN,
    lookbackDays: parsed.data.LOOKBACK_DAYS,
    firstReviewThresholdHours: parsed.data.FIRST_REVIEW_THRESHOLD_HOURS,
    cutoffDate,
  };
}
