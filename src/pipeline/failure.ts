import type {
  AnalysisDescriptor,
  AnalysisFormat,
  AnalysisResult,
  AnalysisStatus,
} from "./types.js";

export class NoDataError extends Error {
  readonly status: AnalysisStatus = "no-data";
  constructor(reason: string) {
    super(reason);
    this.name = "NoDataError";
  }
}

function formatFor(descriptor: AnalysisDescriptor): AnalysisFormat {
  return descriptor.type === "ai" ? "markdown" : "json";
}

function baseResult(
  descriptor: AnalysisDescriptor,
  status: AnalysisStatus,
): AnalysisResult {
  return {
    id: descriptor.id,
    format: formatFor(descriptor),
    status,
    ...(descriptor.renderer !== undefined ? { renderer: descriptor.renderer } : {}),
  };
}

export function ok(
  descriptor: AnalysisDescriptor,
  data: unknown,
): AnalysisResult {
  return { ...baseResult(descriptor, "ok"), data };
}

export function noData(
  descriptor: AnalysisDescriptor,
  reason: string,
): AnalysisResult {
  return { ...baseResult(descriptor, "no-data"), reason };
}

export function skipped(
  descriptor: AnalysisDescriptor,
  reason: string,
): AnalysisResult {
  return { ...baseResult(descriptor, "skipped"), reason };
}

export function errored(
  descriptor: AnalysisDescriptor,
  error: unknown,
): AnalysisResult {
  if (error instanceof NoDataError) {
    return noData(descriptor, error.message);
  }
  const reason = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  return {
    ...baseResult(descriptor, "error"),
    reason,
    ...(stack ? { stack } : {}),
  };
}

export async function runWithFailure(
  descriptor: AnalysisDescriptor,
  fn: () => Promise<unknown> | unknown,
): Promise<AnalysisResult> {
  try {
    const data = await fn();
    return ok(descriptor, data);
  } catch (error) {
    return errored(descriptor, error);
  }
}
