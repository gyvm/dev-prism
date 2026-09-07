/// <reference path="./webmcp.d.ts" />

import type { AnalysisContext, AnalysisTemplateId } from "../ai/analysis-context.js";
import { isAnalysisTemplateId } from "../ai/analysis-markdown.js";

export const WEBMCP_ANALYSIS_TOOL_NAME = "get_dev_prism_analysis_context";

type ContextLoader = (
  templateId: AnalysisTemplateId,
  signal: AbortSignal,
) => Promise<AnalysisContext>;

function parseInput(input: unknown): AnalysisTemplateId {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("templateId is required");
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== "templateId" || typeof record.templateId !== "string") {
    throw new Error("Only templateId is accepted");
  }
  if (!isAnalysisTemplateId(record.templateId)) {
    throw new Error(`Unknown templateId: ${record.templateId}`);
  }
  return record.templateId;
}

/** Registers the optional read-only tool and does nothing on unsupported browsers. */
export async function registerWebMcpAnalysisTool(
  loadContext: ContextLoader,
  signal: AbortSignal,
  targetDocument?: Document,
): Promise<void> {
  const host = targetDocument ?? (typeof document === "undefined" ? undefined : document);
  const modelContext = host?.modelContext;
  if (!modelContext || signal.aborted) return;

  await modelContext.registerTool(
    {
      name: WEBMCP_ANALYSIS_TOOL_NAME,
      description: "Read the current Dev Prism Explore aggregate analysis context.",
      inputSchema: {
        type: "object",
        properties: {
          templateId: {
            type: "string",
            enum: ["flow", "review", "timeline", "wip"],
          },
        },
        required: ["templateId"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        consequentialHint: false,
        untrustedContentHint: true,
      },
      execute: async (input, execution) => {
        const templateId = parseInput(input);
        if (execution.signal.aborted) throw new DOMException("Tool execution was cancelled", "AbortError");
        return loadContext(templateId, execution.signal);
      },
    },
    { signal },
  );
}

export { parseInput as parseWebMcpAnalysisInput };
