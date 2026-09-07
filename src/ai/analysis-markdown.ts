import type {
  AnalysisContext,
  AnalysisData,
  AnalysisTemplateId,
  FlowAnalysisData,
  ReviewAnalysisData,
  TimelineAnalysisData,
} from "./analysis-context.js";

export const MAX_ANALYSIS_MARKDOWN_CHARS = 30_000;

export type AnalysisRequest = Readonly<{
  title: string;
  description: string;
  instructions: readonly string[];
}>;

function inline(value: string): string {
  return value.replaceAll("`", "'").replaceAll("\n", " ");
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}

function trimTrend<T extends { buckets: readonly unknown[] }>(trend: T, limit: number): T {
  return trend.buckets.length > limit
    ? { ...trend, buckets: limit === 0 ? [] : trend.buckets.slice(-limit) }
    : trend;
}

function compactData(data: AnalysisData, timeSeriesLimit: number, entityLimit: number): unknown {
  if (data.kind === "flow") {
    const flow: FlowAnalysisData = {
      ...data,
      leadTrend: trimTrend(data.leadTrend, timeSeriesLimit),
      activityTrend: trimTrend(data.activityTrend, timeSeriesLimit),
    };
    return flow;
  }
  if (data.kind === "review") {
    const review: ReviewAnalysisData = {
      ...data,
      activityTrend: trimTrend(data.activityTrend, timeSeriesLimit),
      correlation: {
        ...data.correlation,
        authors: data.correlation.authors.slice(0, entityLimit),
        reviewers: data.correlation.reviewers.slice(0, entityLimit),
        pairs: data.correlation.pairs.slice(0, entityLimit),
      },
      reviewerLead: { reviewers: data.reviewerLead.reviewers.slice(0, entityLimit) },
    };
    return review;
  }
  if (data.kind === "timeline") {
    const timeline: TimelineAnalysisData = {
      ...data,
      leadTrend: trimTrend(data.leadTrend, timeSeriesLimit),
    };
    return timeline;
  }
  return data;
}

function render(
  context: AnalysisContext,
  request: AnalysisRequest,
  timeSeriesLimit: number,
  entityLimit: number,
  extraLimitations: readonly string[] = [],
  dataOverride?: unknown,
): string {
  const scope = {
    effective: context.scope,
    requested: context.requestedScope,
    asOf: context.asOf,
    referenceUrl: context.referenceUrl === null ? null : inline(context.referenceUrl),
  };
  const truncation = context.truncated
    ? ["時系列バケットが52件を超えたため、古いバケットを省略しています。"]
    : [];
  const limitations = [...context.limitations, ...context.missingData, ...truncation, ...extraLimitations];
  const data = dataOverride ?? compactData(context.data, timeSeriesLimit, entityLimit);

  return [
    "# Dev Prism AI Analysis",
    "",
    "## Analysis request",
    request.title,
    "",
    request.description,
    "",
    ...request.instructions.map((instruction) => `- ${instruction}`),
    "",
    "## Scope",
    "```json",
    json(scope),
    "```",
    "",
    "## Metric definitions",
    ...context.metricDefinitions.map((definition) => `- ${definition}`),
    "",
    "## Aggregated data",
    "```json",
    json({ contextVersion: context.contextVersion, templateId: context.templateId, truncated: context.truncated, data }),
    "```",
    "",
    "## Limitations",
    ...limitations.map((limitation) => `- ${limitation}`),
    "",
  ].join("\n");
}

/**
 * Formats one deterministic, privacy-reduced Markdown prompt. When the output
 * limit is reached, the oldest trend buckets are removed before lower-priority
 * reviewer rows are compacted.
 */
export function buildAnalysisMarkdown(context: AnalysisContext, request: AnalysisRequest): string {
  let timeSeriesLimit = 52;
  let entityLimit = Number.POSITIVE_INFINITY;
  let markdown = render(context, request, timeSeriesLimit, entityLimit);

  while (markdown.length > MAX_ANALYSIS_MARKDOWN_CHARS && timeSeriesLimit > 0) {
    timeSeriesLimit = Math.max(0, timeSeriesLimit - 4);
    markdown = render(context, request, timeSeriesLimit, entityLimit, [
      "Markdownの上限に合わせ、古い時系列バケットを追加で縮約しました。",
    ]);
  }

  while (markdown.length > MAX_ANALYSIS_MARKDOWN_CHARS && entityLimit > 0) {
    entityLimit = Number.isFinite(entityLimit) ? Math.floor(entityLimit / 2) : 256;
    markdown = render(context, request, timeSeriesLimit, entityLimit, [
      "Markdownの上限に合わせ、レビュアー集計の低優先度行を縮約しました。",
    ]);
  }

  if (markdown.length <= MAX_ANALYSIS_MARKDOWN_CHARS) return markdown;

  const fallback = render(
    context,
    request,
    0,
    0,
    ["Markdownの上限に合わせ、詳細な集計行を省略しました。元データの再取得は行っていません。"],
    { kind: context.data.kind, detailOmitted: true },
  );
  if (fallback.length <= MAX_ANALYSIS_MARKDOWN_CHARS) return fallback;

  // The static headings and definitions are bounded by source code. Keep a
  // final guard so a future long label cannot violate the public contract.
  const suffix = "\n\n- 詳細はMarkdown文字数上限により省略されました。\n";
  return `${fallback.slice(0, MAX_ANALYSIS_MARKDOWN_CHARS - suffix.length)}${suffix}`;
}

export function formatAnalysisScope(context: AnalysisContext): string {
  return json(context.scope);
}

export function isAnalysisTemplateId(value: string | null | undefined): value is AnalysisTemplateId {
  return value === "flow" || value === "review" || value === "timeline" || value === "wip";
}
