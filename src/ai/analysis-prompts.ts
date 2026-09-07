import type { AnalysisContext, AnalysisTemplateId, AnalysisViewId } from "./analysis-context.js";
import { buildAnalysisMarkdown, type AnalysisRequest } from "./analysis-markdown.js";

export type AnalysisPromptDefinition = Readonly<{
  id: AnalysisTemplateId;
  title: string;
  description: string;
  view: AnalysisViewId;
  buildPrompt: (context: AnalysisContext) => string;
}>;

const REQUESTS: Readonly<Record<AnalysisTemplateId, AnalysisRequest>> = {
  flow: {
    title: "フロー改善分析",
    description: "開発フローの速度・安定性・工程別の滞留を、対象スコープの集計値だけから分析してください。",
    instructions: [
      "入力データだけを根拠にし、事実・推測・追加確認事項を分けてください。",
      "データにない原因や因果関係を断定しないでください。",
      "日本語で、要約 / 根拠 / 仮説 / 改善案 / 追加確認事項の順に出力してください。",
    ],
  },
  review: {
    title: "レビュー遅延・負荷分析",
    description: "レビューなし率、レビュー待ち時間、活動量、レビュアー別集計からレビュー負荷を分析してください。",
    instructions: [
      "入力データだけを根拠にし、事実・推測・追加確認事項を分けてください。",
      "レビュー担当者の能力や意図など、データにない原因を断定しないでください。",
      "日本語で、要約 / 根拠 / 仮説 / 改善案 / 追加確認事項の順に出力してください。",
    ],
  },
  timeline: {
    title: "ステージ別ボトルネック分析",
    description: "工程別中央値・件数と時系列の変化から、工程上のボトルネック候補を分析してください。",
    instructions: [
      "入力データだけを根拠にし、事実・推測・追加確認事項を分けてください。",
      "最大の中央値を原因と同一視せず、データにない原因を断定しないでください。",
      "日本語で、要約 / 根拠 / 仮説 / 改善案 / 追加確認事項の順に出力してください。",
    ],
  },
  wip: {
    title: "オープンPR滞留分析",
    description: "現在オープン中のPR数、レビュー待ち数、最古PR年齢、年齢分布から滞留を分析してください。",
    instructions: [
      "入力データだけを根拠にし、事実・推測・追加確認事項を分けてください。",
      "滞留の原因や個人・チームの責任を、データにない根拠で断定しないでください。",
      "日本語で、要約 / 根拠 / 仮説 / 改善案 / 追加確認事項の順に出力してください。",
    ],
  },
};

function definition(id: AnalysisTemplateId): AnalysisPromptDefinition {
  const request = REQUESTS[id];
  return {
    id,
    title: request.title,
    description: request.description,
    view: id,
    buildPrompt: (context) => buildAnalysisMarkdown(context, request),
  };
}

export const ANALYSIS_PROMPTS: Readonly<Record<AnalysisTemplateId, AnalysisPromptDefinition>> = {
  flow: definition("flow"),
  review: definition("review"),
  timeline: definition("timeline"),
  wip: definition("wip"),
};

export function getAnalysisPrompt(id: AnalysisTemplateId): AnalysisPromptDefinition {
  return ANALYSIS_PROMPTS[id];
}
