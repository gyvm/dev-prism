// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// Astro shell for the Explore-only front-end.
// The npm scripts invoke `astro --root src/web`, which sets the project root to
// src/web; the srcDir/publicDir/outDir paths below are resolved relative to it.
// (Running `astro` from elsewhere without that flag would misresolve outDir.)
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
    // Tailwind v4 + daisyUI run via @tailwindcss/postcss (postcss.config.mjs),
    // NOT @tailwindcss/vite: the Vite plugin is incompatible with Astro 6's
    // rolldown-vite (passes aliasOnly:true → "Missing field tsconfigPaths").
    // See withastro/astro#16542. PostCSS processes src/ui/theme.css, imported
    // in Layout.astro. That file styles the Explore shell only — the Node CLI
    // the browser Explore path consumes it.
    // Both paths derive their palette from src/ui/tokens.ts; tokens.test.ts
    // fails if theme.css drifts from it.
    //
    // duckdb-wasm ships its own workers/wasm; excluding it from dep
    // pre-bundling keeps Vite from mangling the worker URLs.
    optimizeDeps: { exclude: ["@duckdb/duckdb-wasm"] },
  },
});
