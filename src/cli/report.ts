import { orchestrate } from "../pipeline/orchestrate.js";
import {
  CollectorError,
  ConfigError,
  MetricsError,
  RuntimeConfigError,
} from "../shared/errors.js";

type ReportCliOptions = {
  configPath?: string;
  dataDir?: string;
  reportsDir?: string;
  indexHtmlPath?: string;
  skillsRoot?: string;
  fromJsonlPath?: string;
  now?: Date;
  skipAi: boolean;
};

export function parseArgs(argv: string[]): ReportCliOptions {
  const options: ReportCliOptions = { skipAi: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--skip-ai") {
      options.skipAi = true;
      continue;
    }

    if (argument === "--week") {
      const value = argv[index + 1];
      if (!value) throw new Error("--week requires a YYYY-MM-DD date");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`--week expects YYYY-MM-DD, got "${value}"`);
      }
      const parsed = new Date(`${value}T12:00:00Z`);
      if (
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== value
      ) {
        throw new Error(`--week could not parse "${value}"`);
      }
      options.now = parsed;
      index += 1;
      continue;
    }

    const pathFlags = new Map<string, keyof ReportCliOptions>([
      ["--config", "configPath"],
      ["--data-dir", "dataDir"],
      ["--reports-dir", "reportsDir"],
      ["--index", "indexHtmlPath"],
      ["--skills", "skillsRoot"],
      ["--from-jsonl", "fromJsonlPath"],
    ]);

    const optionName = pathFlags.get(argument ?? "");
    if (optionName) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a path`);
      options[optionName] = value as never;
      index += 1;
      continue;
    }

    if (argument === "--help" || argument === "-h") {
      process.stdout.write(
        "Usage: npm run report -- [--config path] [--data-dir path] [--reports-dir path] [--index path] [--skills path] [--from-jsonl path] [--week YYYY-MM-DD] [--skip-ai]\n" +
          "  --week  対象週(月曜始まり)に含まれる任意の日付。--from-jsonl 併用時は無視\n",
      );
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function formatError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const isDomainError =
    error instanceof ConfigError ||
    error instanceof RuntimeConfigError ||
    error instanceof CollectorError ||
    error instanceof MetricsError;
  return isDomainError ? error.message : (error.stack ?? error.message);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await orchestrate(options);

  process.stdout.write(`Written: ${result.jsonlPath}\n`);
  process.stdout.write(`Written: ${result.render.htmlPath}\n`);
  process.stdout.write(`Written: ${result.manifestPath}\n`);
  process.stdout.write(`Written: ${result.indexHtmlPath}\n`);

  const summary = result.analyze.results.reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const summaryText = Object.entries(summary)
    .map(([status, count]) => `${status}=${count}`)
    .join(" ");
  process.stdout.write(
    `\nPeriod: ${result.period.id} | analyses: ${summaryText}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${formatError(error)}\n`);
  process.exitCode = 1;
});
