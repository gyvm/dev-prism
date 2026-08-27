import { copyExploreData, DEFAULT_DWH_DIR, DEFAULT_OUT_DIR } from "../web/explore-data.js";

// Copies the Explore-specific DWH subset into the public dir so the dev server /
// build serves it for DuckDB-WASM to fetch (registerFileBuffer). The complete
// DWH, including bodies.parquet, remains in the source directory for other
// batch consumers.
// Usage: npm run explore:data -- [--dwh-dir data/dwh] [--out src/web/public/data]

function parseArgs(argv: readonly string[]): { dwhDir: string; outDir: string } {
  const options = { dwhDir: DEFAULT_DWH_DIR, outDir: DEFAULT_OUT_DIR };
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
  const files = await copyExploreData({ dwhDir, outDir });
  process.stdout.write(`Copied ${files.length} Explore parquet file(s) to ${outDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
