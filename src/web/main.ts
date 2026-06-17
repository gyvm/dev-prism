import { PAGE_STYLES } from "../renderers/page-styles.js";
import { createWasmRunner } from "./duckdb-runner.js";

// Step 2: boot DuckDB-WASM over the served Parquet and run a smoke query to
// prove the browser runner reads the DWH. Query/render wiring lands next.
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
  try {
    const runner = await createWasmRunner();
    const rows = await runner.all<{ pr_count: bigint | number }>(
      "SELECT count(*) AS pr_count FROM pull_requests",
    );
    const count = Number(rows[0]?.pr_count ?? 0);
    setStatus(`DWH 接続OK — pull_requests: ${count} 件`);
    const results = document.getElementById("results");
    if (results) results.dataset["prCount"] = String(count);
  } catch (error) {
    setStatus(`エラー: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

void main();
