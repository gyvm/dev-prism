import { PAGE_STYLES } from "../renderers/page-styles.js";
import { scopeToSearchParams } from "../analyses/scope-url.js";
import type { Scope } from "../analyses/scope.js";
import { createWasmRunner, type WasmRunner } from "./duckdb-runner.js";
import { buildExploreHtml, scopeFromUrl } from "./explore.js";
import { mountFilters, renderFilterControls } from "./filters.js";

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = PAGE_STYLES;
  document.head.appendChild(style);
}

function setStatus(text: string): void {
  const status = document.getElementById("status");
  if (status) status.textContent = text;
}

function syncUrl(scope: Scope): void {
  const query = scopeToSearchParams(scope).toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

// innerHTML does not execute <script> tags; the bipartite/gantt renderers ship
// their hover/tooltip behavior as inline scripts, so re-create each to run it.
function activateScripts(root: HTMLElement): void {
  for (const old of [...root.querySelectorAll("script")]) {
    const fresh = document.createElement("script");
    for (const attr of [...old.attributes]) fresh.setAttribute(attr.name, attr.value);
    fresh.textContent = old.textContent;
    old.replaceWith(fresh);
  }
}

// Monotonic guard: a slower earlier run must not overwrite a newer one.
let generation = 0;

async function run(runner: WasmRunner, scope: Scope, results: HTMLElement): Promise<void> {
  const gen = ++generation;
  syncUrl(scope);
  setStatus("集計中…");
  const html = await buildExploreHtml(runner, scope);
  if (gen !== generation) return; // superseded by a later submit
  results.innerHTML = html;
  activateScripts(results);
  setStatus(`集計完了 (${scope.from?.toISOString().slice(0, 10)} 〜 ${scope.to?.toISOString().slice(0, 10)})`);
}

async function main(): Promise<void> {
  injectStyles();
  setStatus("DuckDB-WASM を起動中…");
  const results = document.getElementById("results");
  const form = document.getElementById("filters") as HTMLFormElement | null;
  if (!results || !form) return;
  try {
    const runner = await createWasmRunner();
    let scope = scopeFromUrl(window.location.search, new Date());
    mountFilters(form, scope, (next) => {
      scope = next;
      renderFilterControls(form, scope);
      void run(runner, scope, results);
    });
    await run(runner, scope, results);
  } catch (error) {
    setStatus(`エラー: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

void main();
