import { renderSchemaSql } from "../warehouse/schema.js";

export function parseArgs(argv: string[]): { help: boolean } {
  if (argv.length === 0) {
    return { help: false };
  }

  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    return { help: true };
  }

  throw new Error(`Unknown argument: ${argv.join(" ")}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write("Usage: npm run dwh:schema\n");
    return;
  }

  process.stdout.write(renderSchemaSql());
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
