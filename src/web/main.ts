import { PAGE_STYLES } from "../renderers/page-styles.js";

// Step 1 bootstrap: inject the shared report CSS and confirm the page mounts.
// The DuckDB-WASM runner + query wiring land in the following steps.
function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = PAGE_STYLES;
  document.head.appendChild(style);
}

function main(): void {
  injectStyles();
  const status = document.getElementById("status");
  if (status) status.textContent = "Explore scaffold ready";
}

main();
