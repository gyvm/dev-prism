import { queryActivityTrend } from "../analyses/activity-trend/query.js";
import type { ActivityTrend } from "../analyses/activity-trend/view-model.js";
import {
  queryAgingHistogram,
  queryAgingSummary,
} from "../analyses/aging/query.js";
import type { AgingHistogram, AgingSummary } from "../analyses/aging/view-model.js";
import { queryCycleFunnel, queryLeadTrend } from "../analyses/cycle-time/query.js";
import type { CycleFunnel, LeadTrend } from "../analyses/cycle-time/view-model.js";
import { queryDoraComparison } from "../analyses/dora-metrics/query.js";
import type { DoraComparison } from "../analyses/dora-metrics/view-model.js";
import { resolveScope, type Scope } from "../analyses/scope.js";
import { queryReviewCorrelation } from "../analyses/review-correlation/query.js";
import type { ReviewCorrelation } from "../shared/types.js";
import {
  queryReviewerLead,
  queryReviewlessMerges,
} from "../analyses/review-metrics/query.js";
import type { ReviewerLeadTimes, ReviewlessMerges } from "../analyses/review-metrics/view-model.js";
import type { DwhQueryRunner } from "../warehouse/runner.js";

export const ANALYSIS_CONTEXT_VERSION = "1" as const;
export const MAX_ANALYSIS_TIME_SERIES_BUCKETS = 52;

export type AnalysisTemplateId = "flow" | "review" | "timeline" | "wip";
export type AnalysisViewId = AnalysisTemplateId;

export type AnalysisScope = Readonly<{
  from: string | null;
  to: string | null;
  repos: readonly string[];
  users: readonly string[];
  includeBots: boolean;
  grain: Scope["grain"];
}>;

export type FlowAnalysisData = Readonly<{
  kind: "flow";
  dora: DoraComparison;
  cycleFunnel: CycleFunnel;
  leadTrend: LeadTrend;
  activityTrend: ActivityTrend;
}>;

export type ReviewAnalysisData = Readonly<{
  kind: "review";
  reviewlessMerges: ReviewlessMerges;
  activityTrend: ActivityTrend;
  correlation: ReviewCorrelation;
  reviewerLead: ReviewerLeadTimes;
}>;

export type TimelineAnalysisData = Readonly<{
  kind: "timeline";
  cycleFunnel: CycleFunnel;
  leadTrend: LeadTrend;
  bottleneckStage: string | null;
}>;

export type WipAnalysisData = Readonly<{
  kind: "wip";
  summary: AgingSummary;
  histogram: AgingHistogram;
  asOf: string;
}>;

export type AnalysisData =
  | FlowAnalysisData
  | ReviewAnalysisData
  | TimelineAnalysisData
  | WipAnalysisData;

export type AnalysisContext = Readonly<{
  contextVersion: typeof ANALYSIS_CONTEXT_VERSION;
  templateId: AnalysisTemplateId;
  view: AnalysisViewId;
  /** Scope actually used by the view's queries. WIP has no period bounds. */
  scope: AnalysisScope;
  /** Scope selected in Explore before a view-specific interpretation. */
  requestedScope: AnalysisScope;
  referenceUrl: string | null;
  asOf: string | null;
  data: AnalysisData;
  metricDefinitions: readonly string[];
  missingData: readonly string[];
  limitations: readonly string[];
  truncated: boolean;
}>;

const COMMON_LIMITATIONS = [
  "このコンテキストは集計値のみで構成され、PR本文・レビュー本文・コメント本文を含みません。",
  "PR単位のタイトル・URL・番号、完全なPR一覧、SQL文字列、DWHファイルは含みません。",
  "null は欠損または計算不能を表し、推測値で補完していません。",
  "0件や空配列は問題がないことを意味しません。対象期間、収集範囲、欠損データを確認してください。",
  `時系列バケットは新しいものを優先し、最大${MAX_ANALYSIS_TIME_SERIES_BUCKETS}件です。`,
] as const;

const METRIC_DEFINITIONS: Readonly<Record<AnalysisTemplateId, readonly string[]>> = {
  flow: [
    "deploymentFrequency: 対象期間にマージされたPR数。",
    "leadTimeForChangesHours: マージ済みPRの作成からマージまでの中央値（時間）。",
    "changeFailureRatePercent: Revertタイトルのマージ済みPR割合。",
    "mttrHours: RevertタイトルのPRについて、作成からマージまでの平均時間。",
    "cycleFunnel: commit→open、open→review、review→approve、approve→mergeの各工程の中央値と対象件数。",
    "activityTrend: 粒度ごとのPR作成・マージ・レビュー・コメント件数。",
  ],
  review: [
    "reviewlessRate: マージ済みPRのうちレビューがないPRの割合。分母0件ならnull。",
    "activityTrend: 粒度ごとのレビュー・コメント件数（PR作成・マージも併記）。",
    "reviewerLead: レビュー依頼から最初のレビュー提出までのレビュアー別中央値。未回答依頼はpendingCountとして別集計。",
    "correlation: 作成者・レビュアー・作成者×レビュアーの集計件数。",
  ],
  timeline: [
    "cycleFunnel: 4工程それぞれで両端の時刻が存在し、負の時間を除外した中央値と件数。",
    "leadTrend: 粒度ごとの工程別中央値と件数。",
    "bottleneckStage: 現在の工程中央値のうち最大の工程。全工程nullならnull。",
  ],
  wip: [
    "openCount: 現在オープン中（未マージかつ未クローズ）のPR数。",
    "awaitingReviewCount: 現在レビュー待ちと判定されたオープンPR数。",
    "oldestAgeDays: 最古のオープンPRの作成から基準時点までの経過日数。オープンPRがなければnull。",
    "histogram: オープンPRの経過時間を<1d、1-3d、3-7d、7-14d、14d+に分類した件数。",
  ],
};

function serializeScope(scope: Scope): AnalysisScope {
  return {
    from: scope.from?.toISOString() ?? null,
    to: scope.to?.toISOString() ?? null,
    repos: [...scope.repos],
    users: [...scope.users],
    includeBots: scope.includeBots,
    grain: scope.grain,
  };
}

function trimActivityTrend(trend: ActivityTrend): Readonly<{ value: ActivityTrend; truncated: boolean }> {
  const truncated = trend.buckets.length > MAX_ANALYSIS_TIME_SERIES_BUCKETS;
  return {
    value: truncated
      ? { ...trend, buckets: trend.buckets.slice(-MAX_ANALYSIS_TIME_SERIES_BUCKETS) }
      : trend,
    truncated,
  };
}

function trimLeadTrend(trend: LeadTrend): Readonly<{ value: LeadTrend; truncated: boolean }> {
  const truncated = trend.buckets.length > MAX_ANALYSIS_TIME_SERIES_BUCKETS;
  return {
    value: truncated
      ? { ...trend, buckets: trend.buckets.slice(-MAX_ANALYSIS_TIME_SERIES_BUCKETS) }
      : trend,
    truncated,
  };
}

function findBottleneck(cycleFunnel: CycleFunnel): string | null {
  const measured = cycleFunnel.stages.filter((stage) => stage.p50Hours !== null);
  if (measured.length === 0) return null;
  return measured.reduce((longest, stage) =>
    (longest.p50Hours ?? Number.NEGATIVE_INFINITY) >= (stage.p50Hours ?? Number.NEGATIVE_INFINITY)
      ? longest
      : stage,
  ).key;
}

function missingDataFor(data: AnalysisData): readonly string[] {
  const missing: string[] = [];
  if (data.kind === "flow") {
    if (data.dora.current.deploymentFrequency === 0) {
      missing.push("DORA指標は対象期間にマージ済みPRがないため、中央値・割合の一部を計算できません。");
    }
    if (data.cycleFunnel.stages.every((stage) => stage.p50Hours === null)) {
      missing.push("サイクルタイムは対象期間に工程の両端が揃ったマージ済みPRがありません。");
    }
    if (data.leadTrend.buckets.length === 0 && data.activityTrend.buckets.length === 0) {
      missing.push("時系列データがありません。対象期間、収集範囲、または必要なイベントの欠損を確認してください。");
    }
  } else if (data.kind === "review") {
    if (data.reviewlessMerges.mergedCount === 0) {
      missing.push("レビューなし率は分母となるマージ済みPRがないため計算できません。");
    }
    if (data.activityTrend.buckets.length === 0) {
      missing.push("レビュー・コメントの時系列データがありません。");
    }
    if (data.correlation.reviewers.length === 0 && data.reviewerLead.reviewers.length === 0) {
      missing.push("レビュアー集計に対象データがありません。レビュー依頼・提出イベントの収集状況を確認してください。");
    }
  } else if (data.kind === "timeline") {
    if (data.cycleFunnel.stages.every((stage) => stage.p50Hours === null)) {
      missing.push("工程別中央値は工程の両端が揃った対象PRがないため計算できません。");
    }
    if (data.leadTrend.buckets.length === 0) {
      missing.push("工程別の時系列データがありません。");
    }
  } else if (data.summary.openCount === 0) {
    missing.push("オープンPRがないため、滞留の年齢分布や最古PR年齢は観測できません。");
  }
  return missing;
}

function makeContext(
  templateId: AnalysisTemplateId,
  requestedScope: Scope,
  effectiveScope: Scope,
  data: AnalysisData,
  options: Readonly<{ referenceUrl: string | null; asOf: string | null; truncated: boolean }>,
): AnalysisContext {
  return {
    contextVersion: ANALYSIS_CONTEXT_VERSION,
    templateId,
    view: templateId,
    scope: serializeScope(effectiveScope),
    requestedScope: serializeScope(requestedScope),
    referenceUrl: options.referenceUrl,
    asOf: options.asOf,
    data,
    metricDefinitions: METRIC_DEFINITIONS[templateId],
    missingData: missingDataFor(data),
    limitations: COMMON_LIMITATIONS,
    truncated: options.truncated,
  };
}

/**
 * Builds the privacy-reduced data shared by the copy formatter and WebMCP.
 * Only existing typed view models are used; this layer never reads bodies or
 * runs arbitrary SQL.
 */
export async function buildAnalysisContext(
  runner: DwhQueryRunner,
  templateId: AnalysisTemplateId,
  requestedScope: Scope,
  now: Date,
  referenceUrl: string | null = null,
): Promise<AnalysisContext> {
  const effectiveScope = templateId === "wip" ? { ...requestedScope, from: null, to: null } : requestedScope;

  if (templateId === "flow") {
    const [dora, cycleFunnel, leadTrendRaw, activityTrendRaw] = await Promise.all([
      queryDoraComparison(runner, effectiveScope),
      queryCycleFunnel(runner, effectiveScope),
      queryLeadTrend(runner, effectiveScope),
      queryActivityTrend(runner, effectiveScope),
    ]);
    const leadTrend = trimLeadTrend(leadTrendRaw);
    const activityTrend = trimActivityTrend(activityTrendRaw);
    return makeContext(
      templateId,
      requestedScope,
      effectiveScope,
      { kind: "flow", dora, cycleFunnel, leadTrend: leadTrend.value, activityTrend: activityTrend.value },
      { referenceUrl, asOf: null, truncated: leadTrend.truncated || activityTrend.truncated },
    );
  }

  if (templateId === "review") {
    const [reviewlessMerges, activityTrendRaw, correlation, reviewerLead] = await Promise.all([
      queryReviewlessMerges(runner, effectiveScope),
      queryActivityTrend(runner, effectiveScope),
      queryReviewCorrelation(runner, effectiveScope),
      queryReviewerLead(runner, effectiveScope),
    ]);
    const activityTrend = trimActivityTrend(activityTrendRaw);
    return makeContext(
      templateId,
      requestedScope,
      effectiveScope,
      { kind: "review", reviewlessMerges, activityTrend: activityTrend.value, correlation, reviewerLead },
      { referenceUrl, asOf: null, truncated: activityTrend.truncated },
    );
  }

  if (templateId === "timeline") {
    const [cycleFunnel, leadTrendRaw] = await Promise.all([
      queryCycleFunnel(runner, effectiveScope),
      queryLeadTrend(runner, effectiveScope),
    ]);
    const leadTrend = trimLeadTrend(leadTrendRaw);
    return makeContext(
      templateId,
      requestedScope,
      effectiveScope,
      { kind: "timeline", cycleFunnel, leadTrend: leadTrend.value, bottleneckStage: findBottleneck(cycleFunnel) },
      { referenceUrl, asOf: null, truncated: leadTrend.truncated },
    );
  }

  const [summary, histogram] = await Promise.all([
    queryAgingSummary(runner, effectiveScope, now),
    queryAgingHistogram(runner, effectiveScope, now),
  ]);
  return makeContext(
    templateId,
    requestedScope,
    effectiveScope,
    { kind: "wip", summary, histogram, asOf: now.toISOString() },
    { referenceUrl, asOf: now.toISOString(), truncated: false },
  );
}

/** Small helper for callers that need the normalized default scope in tests/UI. */
export function analysisScopeFrom(scope: Scope): AnalysisScope {
  return serializeScope(resolveScope(scope));
}
