import {
  CollectorError,
  ConfigError,
  MetricsError,
  RuntimeConfigError,
} from "../shared/errors.js";
import {
  analyzeCommand,
  fetchCommand,
  listSkillsCommand,
  renderCommand,
  runCommand,
  type SubcommandOptions,
} from "./commands.js";

export type Subcommand =
  | "run"
  | "fetch"
  | "list-skills"
  | "analyze"
  | "render";

export type ParsedArgs = {
  subcommand: Subcommand;
  options: SubcommandOptions;
};

const SUBCOMMANDS: ReadonlySet<Subcommand> = new Set([
  "run",
  "fetch",
  "list-skills",
  "analyze",
  "render",
]);

const HELP_TEXT = `Usage: pr-weekly-report <subcommand> [flags]

Subcommands:
  run                fetch + AI 分析 + render を一括実行 (default)
  fetch              GraphQL fetch + compute 分析を実行し JSONL を書き出す
  list-skills        AI skill ID 一覧を1行ずつ出力
  analyze            指定 skill の入力 JSON を stdout に出す
                     --write <path|-> を付けると Markdown を JSONL に書き戻す
                     必須: --skill <id>
  render             JSONL から HTML / manifest / JSONL コピーを出力

Common flags:
  --week YYYY-MM-DD  対象週 (月曜始まり) に含まれる任意日付
  --config <path>    config.toml パス (default: config.toml)
  --data-dir <path>  JSONL 保存ディレクトリ (default: data)
  --reports-dir      HTML 出力先 (default: dist/reports)
  --index <path>     index.html 出力先 (default: dist/index.html)
  --skills <path>    skills ディレクトリ (default: skills)
  --from-jsonl <p>   既存 JSONL を読み込む (analyze / render)
  --skip-ai          run でのみ有効。AI 分析をスキップ
  --skill <id>       analyze 用 skill ID
  --write <p|->      analyze で Markdown を書き戻す。'-' で stdin
`;

const FLAG_TO_KEY = new Map<string, keyof SubcommandOptions>([
  ["--config", "configPath"],
  ["--data-dir", "dataDir"],
  ["--reports-dir", "reportsDir"],
  ["--index", "indexHtmlPath"],
  ["--skills", "skillsRoot"],
  ["--from-jsonl", "fromJsonlPath"],
  ["--skill", "skill"],
  ["--write", "writePath"],
]);

function parseWeek(value: string): Date {
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
  return parsed;
}

export function parseArgs(argv: string[]): ParsedArgs {
  let subcommand: Subcommand = "run";
  let rest = argv;
  const first = argv[0];
  if (first && !first.startsWith("-")) {
    if (!SUBCOMMANDS.has(first as Subcommand)) {
      throw new Error(`Unknown subcommand: ${first}`);
    }
    subcommand = first as Subcommand;
    rest = argv.slice(1);
  }

  const options: SubcommandOptions = {};

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    }
    if (arg === "--skip-ai") {
      options.skipAi = true;
      continue;
    }
    if (arg === "--week") {
      const value = rest[i + 1];
      if (!value) throw new Error("--week requires a YYYY-MM-DD date");
      options.now = parseWeek(value);
      i += 1;
      continue;
    }
    const key = FLAG_TO_KEY.get(arg ?? "");
    if (key) {
      const value = rest[i + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      options[key] = value as never;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { subcommand, options };
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

async function runSubcommand(parsed: ParsedArgs): Promise<void> {
  const { subcommand, options } = parsed;
  switch (subcommand) {
    case "fetch":
      return fetchCommand(options);
    case "list-skills":
      return listSkillsCommand(options);
    case "analyze":
      return analyzeCommand(options);
    case "render":
      return renderCommand(options);
    case "run": {
      const result = await runCommand(options);
      process.stdout.write(`Written: ${result.jsonlPath}\n`);
      process.stdout.write(`Written: ${result.htmlPath}\n`);
      process.stdout.write(`Written: ${result.manifestPath}\n`);
      process.stdout.write(`Written: ${result.indexHtmlPath}\n`);
      const summary = result.results.reduce<Record<string, number>>(
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
      return;
    }
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  await runSubcommand(parsed);
}

main().catch((error) => {
  process.stderr.write(`${formatError(error)}\n`);
  process.exitCode = 1;
});
