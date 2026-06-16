import { readFile } from "node:fs/promises";

import { parse as parseToml } from "smol-toml";
import { z } from "zod";

import { ConfigError } from "../shared/errors.js";
import { resolveScope, type Scope } from "../analyses/scope.js";

// Declarative report definitions (reports.toml): scope + cadence + title for
// standing reports (design step 6 — "宣言的(定期)"). The cadence is metadata
// for the CI scheduler; the window is computed from `lookback_days` relative to
// a reference date at generation time.

const reportDefinitionSchema = z
  .object({
    title: z.string().min(1),
    cadence: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
    lookback_days: z.number().int().positive(),
    grain: z.enum(["day", "week", "month"]).default("week"),
    repos: z.array(z.string()).default([]),
    users: z.array(z.string()).default([]),
    include_bots: z.boolean().default(true),
    with_ai: z.boolean().default(false),
  })
  .strict();

const reportsConfigSchema = z
  .object({ reports: z.array(reportDefinitionSchema).default([]) })
  .strict();

export type ReportDefinition = z.infer<typeof reportDefinitionSchema>;

export function parseReportsConfig(raw: string): readonly ReportDefinition[] {
  let toml: unknown;
  try {
    toml = parseToml(raw);
  } catch (error) {
    throw new ConfigError(`reports.toml is not valid TOML: ${(error as Error).message}`);
  }
  const result = reportsConfigSchema.safeParse(toml);
  if (!result.success) {
    throw new ConfigError(
      `reports.toml is invalid: ${result.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(", ")}`,
    );
  }
  return result.data.reports;
}

export async function loadReportsConfig(path = "reports.toml"): Promise<readonly ReportDefinition[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return parseReportsConfig(raw);
}

/** Resolves a declarative definition to a concrete scope window ending at `now`. */
export function resolveReportScope(definition: ReportDefinition, now: Date): Scope {
  const to = now;
  const from = new Date(now.getTime() - definition.lookback_days * 86_400_000);
  return resolveScope({
    from,
    to,
    repos: definition.repos,
    users: definition.users,
    includeBots: definition.include_bots,
    grain: definition.grain,
  });
}
