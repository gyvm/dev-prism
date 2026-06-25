import { pathToFileURL } from "node:url";

import { resolveScope } from "../analyses/scope.js";
import { ConfigError } from "../shared/errors.js";
import { parseDateArg } from "../shared/date-arg.js";
import { generateReports, type ReportTask } from "../report/frozen-report.js";
import { loadReportsConfig, resolveReportScope } from "../report/reports-config.js";

export type DwhReportCliOptions = Readonly<{
  dwhDir: string;
  reportsDir: string;
  indexHtmlPath?: string;
  reportsConfigPath?: string;
  now?: Date;
  // on-demand single report
  from?: Date;
  to?: Date;
  repos: string[];
  users: string[];
  grain: "day" | "week" | "month";
  includeBots: boolean;
  title?: string;
}>;


export function parseArgs(argv: readonly string[]): DwhReportCliOptions {
  const options: {
    dwhDir: string; reportsDir: string; indexHtmlPath?: string; reportsConfigPath?: string;
    now?: Date; from?: Date; to?: Date; repos: string[]; users: string[];
    grain: "day" | "week" | "month"; includeBots: boolean; title?: string;
  } = { dwhDir: "data/dwh", reportsDir: "reports", repos: [], users: [], grain: "week", includeBots: true };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = (): string => {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };
    switch (arg) {
      case "--dwh-dir": options.dwhDir = next(); break;
      case "--reports-dir": options.reportsDir = next(); break;
      case "--index": options.indexHtmlPath = next(); break;
      case "--reports-config": options.reportsConfigPath = next(); break;
      case "--now": options.now = parseDateArg("--now", next()); break;
      case "--from": options.from = parseDateArg("--from", next()); break;
      case "--to": options.to = parseDateArg("--to", next()); break;
      case "--repos": options.repos = next().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--users": options.users = next().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--grain": {
        const value = next();
        if (value !== "day" && value !== "week" && value !== "month") {
          throw new Error(`--grain expects day|week|month, got ${JSON.stringify(value)}`);
        }
        options.grain = value;
        break;
      }
      case "--no-bots": options.includeBots = false; break;
      case "--title": options.title = next(); break;
      case "--help": case "-h":
        process.stdout.write(
          "Usage: npm run report:dwh -- (--reports-config reports.toml [--now YYYY-MM-DD] | --from YYYY-MM-DD --to YYYY-MM-DD)\n" +
            "  [--dwh-dir data/dwh] [--reports-dir reports] [--index reports/index.html]\n" +
            "  [--repos a,b] [--users a,b] [--grain week] [--no-bots] [--title T]\n",
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

/** Builds the report task list from CLI options (declarative or on-demand). */
export async function tasksFromOptions(
  options: DwhReportCliOptions,
  now: Date,
): Promise<ReportTask[]> {
  if (options.reportsConfigPath) {
    const definitions = await loadReportsConfig(options.reportsConfigPath);
    return definitions.map((definition) => ({
      title: definition.title,
      scope: resolveReportScope(definition, options.now ?? now),
    }));
  }
  if (!options.from || !options.to) {
    throw new ConfigError("Provide either --reports-config or both --from and --to");
  }
  return [
    {
      title: options.title ?? "PR レポート",
      scope: resolveScope({
        from: options.from,
        to: options.to,
        repos: options.repos,
        users: options.users,
        includeBots: options.includeBots,
        grain: options.grain,
      }),
    },
  ];
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const now = options.now ?? new Date();
  const tasks = await tasksFromOptions(options, now);
  if (tasks.length === 0) {
    process.stdout.write("No reports to generate.\n");
    return;
  }
  const result = await generateReports({
    dwhDir: options.dwhDir,
    reportsDir: options.reportsDir,
    ...(options.indexHtmlPath ? { indexHtmlPath: options.indexHtmlPath } : {}),
    tasks,
    generatedAt: now,
  });
  for (const id of result.ids) {
    process.stdout.write(`Wrote report: ${id}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
