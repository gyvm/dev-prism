import { z } from "zod";

import { RuntimeConfigError } from "./errors.js";
import type { RuntimeConfig } from "./types.js";

// LOOKBACK_DAYS is the safety cap on how far back a fetch may reach, not the
// normal window. The effective cutoff is the report week start, clamped so it
// never predates `now - LOOKBACK_DAYS` (see collect.ts). This keeps a buggy or
// far-past week from triggering a full-history fetch.
const runtimeSchema = z.object({
  GITHUB_TOKEN: z.string().trim().min(1),
  LOOKBACK_DAYS: z.coerce.number().int().positive().default(30),
  FIRST_REVIEW_THRESHOLD_HOURS: z.coerce.number().int().positive().default(48),
});

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): RuntimeConfig {
  const emptyToUndefined = (val: string | undefined) =>
    val?.trim() ? val : undefined;

  // Pass env values through untouched; absent keys fall back to the schema
  // defaults above (LOOKBACK_DAYS = 30) rather than a duplicated literal here.
  const parsed = runtimeSchema.safeParse({
    GITHUB_TOKEN: emptyToUndefined(env.GITHUB_TOKEN),
    LOOKBACK_DAYS: env.LOOKBACK_DAYS,
    FIRST_REVIEW_THRESHOLD_HOURS: env.FIRST_REVIEW_THRESHOLD_HOURS,
  });

  if (!parsed.success) {
    throw new RuntimeConfigError(
      parsed.error.issues.map((issue) => issue.message).join(", "),
    );
  }

  // The earliest date a fetch may reach, regardless of the requested week.
  const cutoffDate = new Date(now);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - parsed.data.LOOKBACK_DAYS);

  return {
    githubToken: parsed.data.GITHUB_TOKEN,
    lookbackDays: parsed.data.LOOKBACK_DAYS,
    firstReviewThresholdHours: parsed.data.FIRST_REVIEW_THRESHOLD_HOURS,
    cutoffDate,
  };
}
