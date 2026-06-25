import { z } from "zod";

// Dependency-free (zod only) schema, types, and view helpers for the report
// gallery index. Kept separate from frozen-report.ts (which pulls in the DWH /
// node-api stack) so the Astro build can import it to SSG the gallery without
// bundling the heavy report-generation dependencies.

const SERIALIZED_SCOPE_SCHEMA = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  repos: z.array(z.string()),
  users: z.array(z.string()),
  includeBots: z.boolean(),
  grain: z.enum(["day", "week", "month"]),
});

const KPI_SCHEMA = z.object({
  deploymentFrequency: z.number(),
  leadTimeForChangesHours: z.number().nullable(),
  prOpened: z.number(),
  prMerged: z.number(),
});

export const REPORT_INDEX_ENTRY_SCHEMA = z.object({
  id: z.string(),
  title: z.string(),
  scope: SERIALIZED_SCOPE_SCHEMA,
  generatedAt: z.string(),
  kpi: KPI_SCHEMA,
  highlights: z.array(z.string()),
  aiCount: z.number(),
});

export const REPORT_INDEX_SCHEMA = z.array(REPORT_INDEX_ENTRY_SCHEMA);

export type ReportIndexEntry = z.infer<typeof REPORT_INDEX_ENTRY_SCHEMA>;

/** Human-readable one-line summary of a report's scope. */
export function scopeSummary(scope: ReportIndexEntry["scope"]): string {
  const parts: string[] = [];
  if (scope.from && scope.to) {
    parts.push(`${scope.from.slice(0, 10)} – ${scope.to.slice(0, 10)}`);
  }
  parts.push(scope.repos.length === 0 ? "全 repo" : `${scope.repos.length} repo`);
  if (scope.users.length > 0) parts.push(`${scope.users.length} 名`);
  if (!scope.includeBots) parts.push("bot 除外");
  return parts.join(" · ");
}

/** Compact KPI line for a report card. */
export function kpiSummary(kpi: ReportIndexEntry["kpi"]): string {
  const lead = kpi.leadTimeForChangesHours;
  return `${kpi.prMerged} merged · ${kpi.prOpened} opened${lead === null ? "" : ` · lead ${lead}h`}`;
}
