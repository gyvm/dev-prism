import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { NormalizedPullRequest } from "../shared/types.js";
import type { AnalysisResult } from "../pipeline/types.js";

import {
  ANALYSIS_LINE_TYPE,
  META_LINE_TYPE,
  PR_LINE_TYPE,
  type AnalysisKind,
  type AnalysisLine,
  type JsonlLine,
  type MetaLine,
  type PrLine,
} from "./types.js";

export type MetaInput = Omit<MetaLine, "type">;

export function metaLine(meta: MetaInput): MetaLine {
  return { type: META_LINE_TYPE, ...meta };
}

export function prLine(pr: NormalizedPullRequest): PrLine {
  return { type: PR_LINE_TYPE, ...pr };
}

export function analysisLine(
  result: AnalysisResult,
  kind: AnalysisKind,
): AnalysisLine {
  const base: AnalysisLine = {
    type: ANALYSIS_LINE_TYPE,
    section: result.id,
    kind,
    status: result.status,
    format: result.format,
    ...(result.renderer ? { renderer: result.renderer } : {}),
    ...(result.reason ? { reason: result.reason } : {}),
    ...(result.stack ? { stack: result.stack } : {}),
  };
  if (result.format === "markdown") {
    const markdown = typeof result.data === "string" ? result.data : "";
    return { ...base, markdown };
  }
  if (result.data !== undefined) {
    return { ...base, data: result.data };
  }
  return base;
}

export function serializeLines(lines: readonly JsonlLine[]): string {
  return lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
}

export type WriteJsonlOptions = Readonly<{
  meta: MetaInput;
  pullRequests: readonly NormalizedPullRequest[];
  analyses: readonly { result: AnalysisResult; kind: AnalysisKind }[];
}>;

export async function writeJsonl(
  path: string,
  options: WriteJsonlOptions,
): Promise<void> {
  const lines: JsonlLine[] = [
    metaLine(options.meta),
    ...options.pullRequests.map(prLine),
    ...options.analyses.map(({ result, kind }) => analysisLine(result, kind)),
  ];
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeLines(lines), "utf-8");
}
