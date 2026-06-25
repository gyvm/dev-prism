import { defineConfig } from "vite";

// Explore frontend (DuckDB-WASM live aggregation over the DWH Parquet).
// root = src/web; parquet is served from src/web/public/data/.
export default defineConfig({
  root: "src/web",
  publicDir: "public",
  build: {
    target: "esnext",
    outDir: "../../dist/explore",
    emptyOutDir: true,
  },
  optimizeDeps: {
    // duckdb-wasm ships its own workers/wasm; let Vite serve it as-is rather
    // than pre-bundling, which mangles the worker URLs.
    exclude: ["@duckdb/duckdb-wasm"],
  },
  server: { port: 4321 },
});
