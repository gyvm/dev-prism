import { pathToFileURL } from "node:url";

import { collectNormalizedPullRequests, hasCollectionFailures } from "../collector/collect.js";
import { buildDwhFromPullRequests } from "../warehouse/build.js";
import {
  readRepoLowWatermarks,
  readRepoWatermarks,
  resolveCollectionWindow,
  type RepoWatermarks,
} from "../warehouse/watermark.js";
import { migrateDwh } from "../warehouse/migrate.js";
import { loadRuntimeConfig } from "../shared/runtime.js";
import { CollectorError, ConfigError, RuntimeConfigError } from "../shared/errors.js";
import { loadUnifiedConfig } from "../shared/config.js";
import { parseDateArg } from "../shared/date-arg.js";

export type DwhBuildCliOptions = Readonly<{
  configPath?: string;
  dwhDir?: string;
  from?: Date;
}>;

export function parseArgs(argv: string[]): DwhBuildCliOptions {
  const options: { configPath?: string; dwhDir?: string; from?: Date } = {};

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

    if (argument === "--from") {
      options.from = parseDateArg("--from", argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--help" || argument === "-h") {
      process.stdout.write(
        "Usage: npm run dwh:build -- [--config path] [--dwh-dir data/dwh] [--from YYYY-MM-DD]\n" +
          "  --from backfills history down to the given date, fetching only the\n" +
          "  uncovered older slice per repo (already-covered repos are skipped).\n",
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

  // Derive the collection cursor from the committed DWH (self-healing, no state
  // file). Incremental mode resumes each repo from max(updated_at) − overlap.
  // Backfill mode (`--from`) instead extends the trailing edge: it reads
  // min(updated_at) and fetches only the uncovered older slice [from, low],
  // skipping repos whose history already reaches `from`.
  const highWatermarks = await readRepoWatermarks(dwhDir);
  const lowWatermarks: RepoWatermarks = options.from
    ? await readRepoLowWatermarks(dwhDir)
    : new Map();
  const fallbackCutoff = loadRuntimeConfig().cutoffDate;

  if (options.from) {
    process.stdout.write(`Backfill mode: extending history down to ${options.from.toISOString().slice(0, 10)}\n`);
  }

  const skipped: string[] = [];
  const collected = await collectNormalizedPullRequests({
    ...(options.configPath ? { configPath: options.configPath } : {}),
    collectionWindowForRepo: (repository) => {
      const repoKey = `${repository.owner}/${repository.name}`;
      const window = resolveCollectionWindow(repoKey, {
        highWatermarks,
        lowWatermarks,
        fallbackCutoff,
        ...(options.from ? { from: options.from } : {}),
      });
      if (window === null) skipped.push(repoKey);
      return window;
    },
  });

  if (skipped.length > 0) {
    process.stdout.write(`Skipped ${skipped.length} repository(s) already covering the backfill range.\n`);
  }

  for (const { repository, error } of collected.errors) {
    process.stderr.write(`[warning] ${repository}: ${formatError(error)}\n`);
  }

  if (collected.rateLimited) {
    const { scope, atRepo, resetAt, pendingRepos } = collected.rateLimited;
    const when = resetAt ? `after ${resetAt.toISOString()}` : "in a few minutes";
    process.stderr.write(
      `[rate-limit] GitHub ${scope} rate limit hit at ${atRepo}; stopped with ${pendingRepos.length} repository(s) not yet collected.\n` +
        `  Partial data is being written. Re-run ${when} to fetch the remaining increment (the cursor resumes automatically).\n`,
    );
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

  // Partial data was written (and is safe to keep — the cursor resumes), but the
  // run did not cover every repo, so fail loudly: a green CI check on an
  // incomplete collection would hide the gap and suppress the needed re-run.
  if (hasCollectionFailures(collected)) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  });
}
