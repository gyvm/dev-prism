// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// Astro shell for the gh-insights front-end (Reports gallery + Explore island).
// The npm scripts invoke `astro --root src/web`, which sets the project root to
// src/web; the srcDir/publicDir/outDir paths below are resolved relative to it.
// (Running `astro` from elsewhere without that flag would misresolve outDir.)
//
// outDir points at the repo-root dist/, which ALSO holds the CLI-generated
// frozen reports (dist/reports/*) and the parquet copied from publicDir
// (dist/data/*). Astro empties outDir before building by default, which would
// wipe those — so `vite.build.emptyOutDir: false` is mandatory. Run a manual
// `rm -rf dist` for clean builds; the documented build order is
// `report:dwh` (writes dist/reports + index.json) → `astro build`.
//
// base is supplied explicitly via ASTRO_BASE (set in the build script) rather
// than import.meta.env.PROD, which is unreliable at config-load time. Dev runs
// at base "/", production GitHub Pages project page at "/pr-weekly-report".
export default defineConfig({
  site: "https://gyvm.github.io/pr-weekly-report",
  base: process.env.ASTRO_BASE ?? "/",
  srcDir: "./",
  publicDir: "./public",
  outDir: "../../dist",
  integrations: [react()],
  vite: {
    // duckdb-wasm ships its own workers/wasm; excluding it from dep
    // pre-bundling keeps Vite from mangling the worker URLs.
    optimizeDeps: { exclude: ["@duckdb/duckdb-wasm"] },
    // Preserve dist/reports and dist/data written before `astro build`.
    build: { emptyOutDir: false },
  },
});
