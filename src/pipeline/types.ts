export type RendererId =
  | "dev-prism-summary"
  | "metric-cards"
  | "gantt-chart"
  | "bipartite-graph";

export type AnalysisType = "compute" | "ai";

export type AnalysisFormat = "markdown" | "json";

export type AnalysisStatus = "ok" | "no-data" | "skipped" | "error";

export type AnalysisDescriptor = Readonly<{
  id: string;
  type: AnalysisType;
  renderer?: RendererId;
  enabled: boolean;
}>;

export type AnalysisResult = Readonly<{
  id: string;
  format: AnalysisFormat;
  renderer?: RendererId;
  status: AnalysisStatus;
  data?: unknown;
  reason?: string;
  stack?: string;
}>;
