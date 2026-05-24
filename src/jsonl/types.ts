import { z } from "zod";

import type { NormalizedPullRequest } from "../shared/types.js";
import type { AnalysisResult } from "../pipeline/types.js";

export const META_LINE_TYPE = "meta" as const;
export const PR_LINE_TYPE = "pr" as const;
export const ANALYSIS_LINE_TYPE = "analysis" as const;

export type MetaLine = Readonly<{
  type: typeof META_LINE_TYPE;
  week: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  timezone: string;
  configHash?: string;
}>;

export type PrLine = Readonly<{ type: typeof PR_LINE_TYPE }> &
  NormalizedPullRequest;

export type AnalysisLine = Readonly<{ type: typeof ANALYSIS_LINE_TYPE }> &
  AnalysisResult;

export type JsonlLine = MetaLine | PrLine | AnalysisLine;

export const metaLineSchema = z.object({
  type: z.literal(META_LINE_TYPE),
  week: z.string(),
  weekStart: z.string(),
  weekEnd: z.string(),
  generatedAt: z.string(),
  timezone: z.string(),
  configHash: z.string().optional(),
});

export const prLineSchema = z
  .object({ type: z.literal(PR_LINE_TYPE) })
  .loose();

export const analysisLineSchema = z
  .object({
    type: z.literal(ANALYSIS_LINE_TYPE),
    id: z.string(),
    status: z.enum(["ok", "no-data", "skipped", "error"]),
    format: z.enum(["markdown", "json"]),
    renderer: z.string().optional(),
    data: z.unknown().optional(),
    reason: z.string().optional(),
    stack: z.string().optional(),
  })
  .loose();

export const jsonlLineSchema = z.discriminatedUnion("type", [
  metaLineSchema,
  prLineSchema,
  analysisLineSchema,
]);
