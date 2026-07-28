import type { Grain } from "../../analyses/scope.js";

// Bucket-axis vocabulary shared by the trend charts (TrendChart, LeadTrendChart).
// Both read the same `grain` off the same scope and render their x-axis labels
// side by side on the flow page, so the label map and the date formats have to
// be one definition — two copies drift the moment either format is tweaked.

export const GRAIN_LABEL: Readonly<Record<Grain, string>> = {
  day: "日次",
  week: "週次",
  month: "月次",
};

const MONTH_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
});
const DAY_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "UTC",
  month: "numeric",
  day: "numeric",
});

/** Bucket-start ISO timestamp → axis label; unparseable input passes through. */
export function formatBucket(iso: string, grain: Grain): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return (grain === "month" ? MONTH_FORMATTER : DAY_FORMATTER).format(date);
}
