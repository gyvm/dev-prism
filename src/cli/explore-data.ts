import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

// Copies a DWH's Parquet files into the Explore public dir so the dev server /
// build serves them for DuckDB-WASM to fetch (registerFileBuffer).
// Usage: npm run explore:data -- [--dwh-dir data/dwh] [--out src/web/public/data]

function parseArgs(argv: readonly string[]): { dwhDir: string; outDir: string } {
  const options = { dwhDir: "data/dwh", outDir: "src/web/public/data" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dwh-dir") options.dwhDir = argv[++i] ?? options.dwhDir;
    else if (arg === "--out") options.outDir = argv[++i] ?? options.outDir;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function main(): Promise<void> {
  const { dwhDir, outDir } = parseArgs(process.argv.slice(2));
  const src = resolve(dwhDir);
  const dest = resolve(outDir);

  const entries = await readdir(src);
  const parquet = entries.filter((name) => name.endsWith(".parquet"));
  if (parquet.length === 0) {
    throw new Error(`No .parquet files found in ${src} — build the DWH first (npm run dwh:build).`);
  }

  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  for (const name of parquet) {
    await cp(join(src, name), join(dest, name));
  }
  process.stdout.write(`Copied ${parquet.length} parquet file(s) to ${dest}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
