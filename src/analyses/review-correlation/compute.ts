import type { ReviewCorrelation } from "../../shared/types.js";
import type { AnalysisContext } from "../context.js";
import { computeReviewCorrelation } from "./internal/reviewCorrelation.js";

export function compute(ctx: AnalysisContext): ReviewCorrelation {
  return computeReviewCorrelation(ctx.rawPrs, ctx.isBotLogin);
}
