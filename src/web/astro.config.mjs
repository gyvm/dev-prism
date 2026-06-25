// @ts-check
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// Dev-only: `astro dev` serves only src/web/pages + publicDir, so the CLI-baked
// frozen reports in dist/reports/ are unreachable and the gallery links 404
// (production serves them from dist/ as ordinary static files, so no plugin is
// needed there). `apply: "serve"` scopes this to the dev server — zero build
// impact. report:dwh must have run first, same precondition as the gallery
// index. Caveat: these are the last-baked reports, not live re-renders.
const serveFrozenReports = {
  name: "serve-frozen-reports",
  apply: "serve",
  /** @param {import("vite").ViteDevServer} server */
  configureServer(server) {
    const reportsDir = resolve(process.cwd(), process.env.REPORTS_DIR ?? "dist/reports");
    server.middlewares.use((req, res, next) => {
      const match = /^\/reports\/([\w.-]+\.html)$/.exec((req.url ?? "").split("?")[0]);
      // /reports/ (the gallery) is an Astro page; only frozen {id}.html files
      // are served here. Never shadow the gallery with a stale built index.html.
      if (!match || match[1] === "index.html") return next();
      const filePath = resolve(reportsDir, match[1]);
      // Regex already forbids slashes; this guards against `..` escaping the dir.
      if (!filePath.startsWith(reportsDir + sep) || !existsSync(filePath)) return next();
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(readFileSync(filePath));
    });
  },
};

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
// at base "/", production GitHub Pages project page at "/dev-prism".
export default defineConfig({
  // base/site are env-driven so the same build serves any deployment: "/" for a
  // custom domain / Cloudflare, "/<repo>/" for a Pages project page. `|| ` (not
  // `??`) so an empty env var — a common Actions footgun — falls back.
  site: process.env.ASTRO_SITE?.trim() || "https://gyvm.github.io/dev-prism",
  base: process.env.ASTRO_BASE?.trim() || "/",
  srcDir: "./",
  publicDir: "./public",
  outDir: "../../dist",
  integrations: [react()],
  vite: {
    // Dev-only static serving of the CLI-baked frozen reports (see above).
    plugins: [serveFrozenReports],
    // Tailwind v4 + daisyUI run via @tailwindcss/postcss (postcss.config.mjs),
    // NOT @tailwindcss/vite: the Vite plugin is incompatible with Astro 6's
    // rolldown-vite (passes aliasOnly:true → "Missing field tsconfigPaths").
    // See withastro/astro#16542. PostCSS processes the shared src/ui/theme.css
    // imported in Layout.astro — the SAME token source the Node CLI report path
    // consumes, so Explore and frozen reports cannot drift.
    //
    // duckdb-wasm ships its own workers/wasm; excluding it from dep
    // pre-bundling keeps Vite from mangling the worker URLs.
    optimizeDeps: { exclude: ["@duckdb/duckdb-wasm"] },
    // Preserve dist/reports and dist/data written before `astro build`.
    build: { emptyOutDir: false },
  },
});
