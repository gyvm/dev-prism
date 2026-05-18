import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { NormalizedPullRequest } from "../shared/types.js";
import type { AnalysisResult } from "../pipeline/types.js";

import { bundleFromLines, parseJsonl, readJsonl } from "./reader.js";
import {
  ANALYSIS_LINE_TYPE,
  META_LINE_TYPE,
  PR_LINE_TYPE,
} from "./types.js";
import {
  analysisLine,
  metaLine,
  prLine,
  serializeLines,
  writeJsonl,
} from "./writer.js";

const META_INPUT = {
  week: "2026-05-11",
  weekStart: "2026-05-11T00:00:00Z",
  weekEnd: "2026-05-17T23:59:59Z",
  generatedAt: "2026-05-18T00:00:00Z",
  timezone: "Asia/Tokyo",
};

const PR_FIXTURE: NormalizedPullRequest = {
  repo: { owner: "foo", name: "bar" },
  number: 1,
  title: "Test PR",
  author: "alice",
  createdAt: "2026-05-12T00:00:00Z",
  mergedAt: "2026-05-13T00:00:00Z",
  closedAt: "2026-05-13T00:00:00Z",
  additions: 10,
  deletions: 2,
  labels: [],
  reviews: [],
  reviewRequests: [],
  isDraft: false,
  timelineEvents: [],
  comments: [],
} as unknown as NormalizedPullRequest;

const COMPUTE_RESULT: AnalysisResult = {
  id: "metric-cards",
  format: "json",
  status: "ok",
  renderer: "metric-cards",
  data: { merged: 5 },
};

const AI_RESULT: AnalysisResult = {
  id: "summary",
  format: "markdown",
  status: "ok",
  data: "## サマリ\n本文",
};

describe("jsonl writer helpers", () => {
  it("metaLine prepends type", () => {
    expect(metaLine(META_INPUT)).toEqual({
      type: META_LINE_TYPE,
      ...META_INPUT,
    });
  });

  it("prLine prepends type and preserves PR fields", () => {
    const line = prLine(PR_FIXTURE);
    expect(line.type).toBe(PR_LINE_TYPE);
    expect(line.number).toBe(1);
    expect(line.repo).toEqual({ owner: "foo", name: "bar" });
  });

  it("analysisLine carries compute data", () => {
    const line = analysisLine(COMPUTE_RESULT, "compute");
    expect(line).toMatchObject({
      type: ANALYSIS_LINE_TYPE,
      section: "metric-cards",
      kind: "compute",
      status: "ok",
      format: "json",
      renderer: "metric-cards",
      data: { merged: 5 },
    });
    expect("markdown" in line).toBe(false);
  });

  it("analysisLine stores markdown under `markdown` for AI results", () => {
    const line = analysisLine(AI_RESULT, "ai");
    expect(line.markdown).toBe("## サマリ\n本文");
    expect("data" in line).toBe(false);
  });

  it("serializeLines emits one JSON object per line with trailing newline", () => {
    const out = serializeLines([
      metaLine(META_INPUT),
      prLine(PR_FIXTURE),
      analysisLine(COMPUTE_RESULT, "compute"),
    ]);
    const lines = out.split("\n");
    expect(out.endsWith("\n")).toBe(true);
    expect(lines[lines.length - 1]).toBe("");
    expect(JSON.parse(lines[0]!).type).toBe(META_LINE_TYPE);
    expect(JSON.parse(lines[1]!).type).toBe(PR_LINE_TYPE);
    expect(JSON.parse(lines[2]!).type).toBe(ANALYSIS_LINE_TYPE);
  });
});

describe("jsonl reader", () => {
  it("parseJsonl skips blank lines", () => {
    const text =
      JSON.stringify(metaLine(META_INPUT)) +
      "\n\n" +
      JSON.stringify(prLine(PR_FIXTURE)) +
      "\n";
    const parsed = parseJsonl(text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.type).toBe(META_LINE_TYPE);
    expect(parsed[1]!.type).toBe(PR_LINE_TYPE);
  });

  it("parseJsonl reports the offending line on JSON syntax errors", () => {
    expect(() => parseJsonl("not-json\n")).toThrow(/line 1/);
  });

  it("parseJsonl rejects unknown line types via schema", () => {
    expect(() => parseJsonl('{"type":"bogus"}\n')).toThrow(/line 1/);
  });

  it("bundleFromLines groups meta / pr / analysis", () => {
    const bundle = bundleFromLines([
      metaLine(META_INPUT),
      prLine(PR_FIXTURE),
      analysisLine(COMPUTE_RESULT, "compute"),
      analysisLine(AI_RESULT, "ai"),
    ]);
    expect(bundle.meta.week).toBe("2026-05-11");
    expect(bundle.pullRequests).toHaveLength(1);
    expect(bundle.pullRequests[0]!.number).toBe(1);
    expect(bundle.analyses).toHaveLength(2);
    expect(bundle.analyses[0]!.section).toBe("metric-cards");
    expect(bundle.analyses[1]!.markdown).toBe("## サマリ\n本文");
  });

  it("bundleFromLines throws when meta is missing", () => {
    expect(() => bundleFromLines([prLine(PR_FIXTURE)])).toThrow(/meta/);
  });
});

describe("jsonl round-trip", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "jsonl-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writeJsonl then readJsonl yields the same bundle", async () => {
    const path = join(dir, "nested", "2026-05-11.jsonl");
    await writeJsonl(path, {
      meta: META_INPUT,
      pullRequests: [PR_FIXTURE],
      analyses: [
        { result: COMPUTE_RESULT, kind: "compute" },
        { result: AI_RESULT, kind: "ai" },
      ],
    });

    const raw = await readFile(path, "utf-8");
    expect(raw.split("\n").filter(Boolean)).toHaveLength(4);

    const bundle = await readJsonl(path);
    expect(bundle.meta.week).toBe("2026-05-11");
    expect(bundle.pullRequests).toHaveLength(1);
    expect(bundle.pullRequests[0]!.title).toBe("Test PR");
    expect(bundle.analyses).toHaveLength(2);
    expect(bundle.analyses[0]!.data).toEqual({ merged: 5 });
    expect(bundle.analyses[1]!.markdown).toBe("## サマリ\n本文");
  });
});
