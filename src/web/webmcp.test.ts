import { describe, expect, it, vi } from "vitest";

import { registerWebMcpAnalysisTool, WEBMCP_ANALYSIS_TOOL_NAME } from "./webmcp.js";
import type { AnalysisContext } from "../ai/analysis-context.js";

function context(): AnalysisContext {
  return {
    contextVersion: "1",
    templateId: "flow",
    view: "flow",
    scope: { from: null, to: null, repos: [], users: [], includeBots: true, grain: "week" },
    requestedScope: { from: null, to: null, repos: [], users: [], includeBots: true, grain: "week" },
    referenceUrl: null,
    asOf: null,
    data: {
      kind: "flow",
      dora: {
        current: {
          deploymentFrequency: 0,
          leadTimeForChangesHours: null,
          changeFailureRatePercent: null,
          mttrHours: null,
        },
        previous: null,
        delta: null,
      },
      cycleFunnel: { stages: [] },
      leadTrend: { grain: "week", buckets: [] },
      activityTrend: { grain: "week", buckets: [] },
    },
    metricDefinitions: [],
    missingData: [],
    limitations: [],
    truncated: false,
  };
}

describe("WebMCP analysis tool", () => {
  it("registers the read-only tool and rejects extra input", async () => {
    let registered: any;
    const registerTool = vi.fn(async (tool: unknown) => {
      registered = tool;
    });
    const fakeDocument = { modelContext: { registerTool } } as unknown as Document;
    const controller = new AbortController();

    await registerWebMcpAnalysisTool(async () => context(), controller.signal, fakeDocument);

    expect(registerTool).toHaveBeenCalledOnce();
    expect(registered.name).toBe(WEBMCP_ANALYSIS_TOOL_NAME);
    expect(registered.inputSchema.additionalProperties).toBe(false);
    expect(registered.annotations).toEqual({
      readOnlyHint: true,
      consequentialHint: false,
      untrustedContentHint: true,
    });
    await expect(registered.execute({ templateId: "flow" }, { signal: controller.signal })).resolves.toMatchObject({
      contextVersion: "1",
    });
    await expect(
      registered.execute({ templateId: "flow", sql: "SELECT 1" }, { signal: controller.signal }),
    ).rejects.toThrow("Only templateId is accepted");
  });

  it("does nothing when modelContext is unavailable", async () => {
    await expect(
      registerWebMcpAnalysisTool(async () => context(), new AbortController().signal, {} as Document),
    ).resolves.toBeUndefined();
  });
});
