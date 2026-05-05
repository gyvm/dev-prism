import { collectNormalizedPullRequests } from "../collector/collect.js";
import { ConfigError, RuntimeConfigError, CollectorError } from "../shared/errors.js";

export type CliOptions = {
  configPath?: string;
  outputJson: boolean;
};

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    outputJson: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--json") {
      options.outputJson = true;
      continue;
    }

    if (argument === "--config") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--config requires a path");
      }
      options.configPath = value;
      index += 1;
      continue;
    }

    if (argument === "--help" || argument === "-h") {
      process.stdout.write("Usage: npm run collect -- [--config path/to/config.toml] [--json]\n");
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function formatError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

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
  const result = await collectNormalizedPullRequests(
    options.configPath ? { configPath: options.configPath } : {},
  );

  for (const { repository, error } of result.errors) {
    process.stderr.write(`[warning] ${repository}: ${formatError(error)}\n`);
  }

  if (options.outputJson) {
    process.stdout.write(`${JSON.stringify(result.pullRequests, null, 2)}\n`);
    return;
  }

  const countsByRepository = new Map<string, number>();
  for (const pullRequest of result.pullRequests) {
    const key = `${pullRequest.repo.owner}/${pullRequest.repo.name}`;
    countsByRepository.set(key, (countsByRepository.get(key) ?? 0) + 1);
  }

  process.stdout.write(`Collected ${result.pullRequests.length} pull requests.\n`);
  for (const [repository, count] of countsByRepository.entries()) {
    process.stdout.write(`- ${repository}: ${count}\n`);
  }

  if (result.errors.length > 0) {
    process.stdout.write(`\n${result.errors.length} repository(s) failed to collect.\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${formatError(error)}\n`);
  process.exitCode = 1;
});
