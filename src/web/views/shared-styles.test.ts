import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EXPLORE_BASE_STYLES } from "../shell/explore-base-styles.js";
import { EXPLORE_STYLES } from "../shell/explore-styles.js";

/**
 * Explore's React views render a shared set of chart class names. Keep the
 * stylesheet contract explicit so a view cannot silently lose its styling.
 */

const viewsDir = fileURLToPath(new URL(".", import.meta.url));

function classNamesUsedBy(source: string): Set<string> {
  const found = new Set<string>();
  // Static className="..." only. Template literals and computed names are out
  // of reach here; keep view class names literal so this stays meaningful.
  for (const match of source.matchAll(/className="([^"{}]+)"/g)) {
    for (const name of match[1]!.trim().split(/\s+/)) found.add(name);
  }
  return found;
}

function definesClass(css: string, name: string): boolean {
  // Matches `.name` when followed by a selector boundary, so `.bg-col` does not
  // count as a definition of `.bg-col-header`.
  return new RegExp(`\\.${name.replace(/[-]/g, "\\-")}(?![\\w-])`).test(css);
}

const viewFiles = readdirSync(viewsDir).filter(
  (name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"),
);

describe("Explore view styling contract", () => {
  it("finds the view components", () => {
    expect(viewFiles.length).toBeGreaterThan(0);
  });

  it.each(viewFiles)("%s only uses classes some stylesheet defines", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const undefinedClasses = [...classNamesUsedBy(source)].filter(
      (name) => !definesClass(EXPLORE_BASE_STYLES, name) && !definesClass(EXPLORE_STYLES, name),
    );
    expect(undefinedClasses, `${file} references unstyled classes`).toEqual([]);
  });

  it("keeps the chart classes the Explore views depend on", () => {
    const loadBearing = [
      "timeline-list",
      "timeline-row",
      "timeline-track",
      "timeline-tooltip",
      "segment",
      "legend-item",
      "legend-swatch",
      "pr-title",
      "pr-author",
      "pr-ref",
      "section-head",
      "metric-grid",
      "metric-card",
      "bg-root",
      "bg-node",
      "bg-bar",
      "bg-edges",
      "bg-legend",
      "empty",
    ];
    const missing = loadBearing.filter((name) => !definesClass(EXPLORE_BASE_STYLES, name));
    expect(missing, "Explore base styles dropped a class Explore renders").toEqual([]);
  });
});
