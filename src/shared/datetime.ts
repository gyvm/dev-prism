import { MetricsError } from "./errors.js";

export function diffHours(start: string, end: string): number {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (Number.isNaN(startMs)) {
    throw new MetricsError(`Invalid start date: "${start}"`);
  }
  if (Number.isNaN(endMs)) {
    throw new MetricsError(`Invalid end date: "${end}"`);
  }
  return (endMs - startMs) / (1000 * 60 * 60);
}
