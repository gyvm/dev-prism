import { readFile } from "node:fs/promises";

import type { NormalizedPullRequest } from "../shared/types.js";
import type { AnalysisResult } from "../pipeline/types.js";

import {
  ANALYSIS_LINE_TYPE,
  META_LINE_TYPE,
  PR_LINE_TYPE,
  jsonlLineSchema,
  type JsonlLine,
  type MetaLine,
  type PrLine,
} from "./types.js";

export function parseJsonl(text: string): JsonlLine[] {
  const out: JsonlLine[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === "") continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (error) {
      throw new Error(
        `JSONL parse error at line ${i + 1}: ${(error as Error).message}`,
      );
    }
    const parsed = jsonlLineSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        `JSONL schema error at line ${i + 1}: ${parsed.error.message}`,
      );
    }
    out.push(parsed.data as JsonlLine);
  }
  return out;
}

export type JsonlBundle = Readonly<{
  meta: MetaLine;
  pullRequests: readonly NormalizedPullRequest[];
  analyses: readonly AnalysisResult[];
}>;

export function bundleFromLines(lines: readonly JsonlLine[]): JsonlBundle {
  const meta = lines.find(
    (line): line is MetaLine => line.type === META_LINE_TYPE,
  );
  if (!meta) {
    throw new Error("JSONL is missing a meta line");
  }
  const pullRequests: NormalizedPullRequest[] = [];
  const analyses: AnalysisResult[] = [];
  for (const line of lines) {
    if (line.type === PR_LINE_TYPE) {
      const { type: _ignored, ...pr } = line as PrLine;
      pullRequests.push(pr as NormalizedPullRequest);
    } else if (line.type === ANALYSIS_LINE_TYPE) {
      const { type: _ignored, ...result } = line;
      analyses.push(result);
    }
  }
  return { meta, pullRequests, analyses };
}

export async function readJsonl(path: string): Promise<JsonlBundle> {
  const text = await readFile(path, "utf-8");
  return bundleFromLines(parseJsonl(text));
}
