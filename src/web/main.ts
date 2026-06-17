import { PAGE_STYLES } from "../renderers/page-styles.js";
import { scopeToSearchParams } from "../analyses/scope-url.js";
import type { Scope } from "../analyses/scope.js";
import { createWasmRunner, type WasmRunner } from "./duckdb-runner.js";
import { renderExplore, scopeFromUrl } from "./explore.js";
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

async function run(runner: WasmRunner, scope: Scope, results: HTMLElement): Promise<void> {
  syncUrl(scope);
  setStatus("集計中…");
  await renderExplore(runner, scope, results);
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
