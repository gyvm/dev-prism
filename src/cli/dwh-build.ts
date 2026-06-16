import { pathToFileURL } from "node:url";

import { collectNormalizedPullRequests } from "../collector/collect.js";
import { buildDwhFromPullRequests } from "../warehouse/build.js";
import { readRepoWatermarks, resolveSince } from "../warehouse/watermark.js";
import { migrateDwh } from "../warehouse/migrate.js";
import { loadRuntimeConfig } from "../shared/runtime.js";
import { CollectorError, ConfigError, RuntimeConfigError } from "../shared/errors.js";
import { loadUnifiedConfig } from "../shared/config.js";

export type DwhBuildCliOptions = Readonly<{
  configPath?: string;
  dwhDir?: string;
}>;

export function parseArgs(argv: string[]): DwhBuildCliOptions {
  const options: { configPath?: string; dwhDir?: string } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--config") {
      const value = argv[index + 1];
      if (!value) throw new Error("--config requires a path");
      options.configPath = value;
      index += 1;
      continue;
    }

    if (argument === "--dwh-dir") {
      const value = argv[index + 1];
      if (!value) throw new Error("--dwh-dir requires a path");
      options.dwhDir = value;
      index += 1;
      continue;
    }

    if (argument === "--help" || argument === "-h") {
      process.stdout.write("Usage: npm run dwh:build -- [--config path] [--dwh-dir data/dwh]\n");
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
    error instanceof CollectorError;
  const prefix = isDomainError ? error.message : (error.stack ?? error.message);
  const cause = error.cause instanceof Error ? `\n  Caused by: ${error.cause.message}` : "";
  return `${prefix}${cause}`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = await loadUnifiedConfig(options.configPath);

  const dwhDir = options.dwhDir ?? "data/dwh";

  // Version-gate the committed DWH first: apply any pending schema migrations
  // up to DWH_SCHEMA_VERSION before reading/writing it (no-op at the baseline).
  const migration = await migrateDwh(dwhDir);
  if (migration.applied.length > 0) {
    process.stdout.write(`Migrated DWH ${migration.from} → ${migration.to}: ${migration.applied.join(", ")}\n`);
  }

  // Derive the incremental cursor from the committed DWH: each repo resumes
  // from max(updated_at) − overlap, so old PRs with new activity are not
  // missed. Repos absent from the DWH fall back to the static cutoffDate.
  const watermarks = await readRepoWatermarks(dwhDir);
  const fallbackCutoff = loadRuntimeConfig().cutoffDate;

  const collected = await collectNormalizedPullRequests({
    ...(options.configPath ? { configPath: options.configPath } : {}),
    cutoffDateForRepo: (repository) =>
      resolveSince(`${repository.owner}/${repository.name}`, watermarks, fallbackCutoff),
  });

  for (const { repository, error } of collected.errors) {
    process.stderr.write(`[warning] ${repository}: ${formatError(error)}\n`);
  }

  const result = await buildDwhFromPullRequests(collected.pullRequests, {
    ...(options.dwhDir ? { dwhDir: options.dwhDir } : {}),
    botPatterns: config.bots.patterns,
  });

  process.stdout.write(`Written DWH: ${result.dwhDir}\n`);
  process.stdout.write(`Changed PRs: ${result.changedPrCount}\n`);
  for (const [table, count] of Object.entries(result.rowsByTable)) {
    process.stdout.write(`- ${table}: incoming=${count}\n`);
  }

  if (collected.errors.length > 0) {
    process.stdout.write(`\n${collected.errors.length} repository(s) failed to collect.\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  });
}
