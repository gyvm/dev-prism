import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { NormalizedPullRequest } from "../shared/types.js";
import type { AnalysisResult } from "../pipeline/types.js";
import { parseJsonl } from "./reader.js";

import {
  ANALYSIS_LINE_TYPE,
  META_LINE_TYPE,
  PR_LINE_TYPE,
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

export function analysisLine(result: AnalysisResult): AnalysisLine {
  return { type: ANALYSIS_LINE_TYPE, ...result };
}

export function serializeLines(lines: readonly JsonlLine[]): string {
  return lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
}

export type WriteJsonlOptions = Readonly<{
  meta: MetaInput;
  pullRequests: readonly NormalizedPullRequest[];
  analyses: readonly AnalysisResult[];
}>;

export async function writeJsonl(
  path: string,
  options: WriteJsonlOptions,
): Promise<void> {
  const lines: JsonlLine[] = [
    metaLine(options.meta),
    ...options.pullRequests.map(prLine),
    ...options.analyses.map(analysisLine),
  ];
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeLines(lines), "utf-8");
}

export async function upsertAnalysisLine(
  path: string,
  next: AnalysisLine,
): Promise<void> {
  const text = await readFile(path, "utf-8");
  const lines = parseJsonl(text);
  let replaced = false;
  const updated = lines.map((line) => {
    if (line.type === ANALYSIS_LINE_TYPE && line.id === next.id) {
      replaced = true;
      return next;
    }
    return line;
  });
  if (!replaced) updated.push(next);
  await writeFile(path, serializeLines(updated), "utf-8");
}
