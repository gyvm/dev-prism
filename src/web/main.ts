import { PAGE_STYLES } from "../renderers/page-styles.js";
import { createWasmRunner } from "./duckdb-runner.js";
import { renderExplore, scopeFromUrl } from "./explore.js";

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = PAGE_STYLES;
  document.head.appendChild(style);
}

function setStatus(text: string): void {
  const status = document.getElementById("status");
  if (status) status.textContent = text;
}

async function main(): Promise<void> {
  injectStyles();
  setStatus("DuckDB-WASM を起動中…");
  const results = document.getElementById("results");
  if (!results) return;
  try {
    const runner = await createWasmRunner();
    const scope = scopeFromUrl(window.location.search, new Date());
    setStatus("集計中…");
    await renderExplore(runner, scope, results);
    setStatus(`集計完了 (${scope.from?.toISOString().slice(0, 10)} 〜 ${scope.to?.toISOString().slice(0, 10)})`);
  } catch (error) {
    setStatus(`エラー: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

void main();
