import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DESIGN_TOKENS, renderRootCss } from "./tokens.js";

const themeCss = readFileSync(fileURLToPath(new URL("./theme.css", import.meta.url)), "utf8");

/**
 * theme.css restates part of the palette as literals because Tailwind's
 * CSS-first config cannot import TypeScript. These tests are what keeps that
 * copy honest — without them the two drift silently, which is exactly how the
 * codebase ended up with three divergent definitions.
 */
describe("design tokens", () => {
  it("emits a :root block that opens with color-scheme and closes cleanly", () => {
    const css = renderRootCss();
    expect(css.startsWith(":root { color-scheme: light; ")).toBe(true);
    expect(css.endsWith("; }")).toBe(true);
  });

  it("emits every token exactly once", () => {
    const css = renderRootCss();
    for (const [name, value] of Object.entries(DESIGN_TOKENS)) {
      expect(css).toContain(`--${name}:${value};`);
    }
  });

  it.each([
    ["--color-base-100", "panel"],
    ["--color-base-200", "bg-default"],
    ["--color-base-300", "bg-muted"],
    ["--color-base-content", "fg-default"],
    ["--color-primary", "accent-cyan"],
    ["--color-secondary", "accent-blue"],
    ["--color-accent", "accent-cyan"],
    ["--color-success", "success"],
    ["--color-warning", "attention"],
    ["--color-error", "danger"],
    ["--color-fg-muted", "fg-muted"],
    ["--color-fg-subtle", "fg-subtle"],
    ["--color-border-default", "border-default"],
    ["--color-border-muted", "border-muted"],
    ["--color-panel-subtle", "panel-subtle"],
  ])("theme.css %s matches the %s token", (cssVar, tokenName) => {
    const match = new RegExp(`${cssVar}:\\s*([^;]+);`).exec(themeCss);
    expect(match, `${cssVar} is missing from theme.css`).not.toBeNull();
    expect(match?.[1]?.trim().toLowerCase()).toBe(DESIGN_TOKENS[tokenName]?.toLowerCase());
  });

  it("keeps purple out of the palette (DESIGN.md rule)", () => {
    // Purple/magenta hues are h≈260–330. Guard the literal hexes we control:
    // daisyUI's bundled themes ship them, which is why theme.css sets
    // `themes: false`.
    const hexes = Object.values(DESIGN_TOKENS).filter((value) => /^#[0-9a-f]{6}$/i.test(value));
    for (const hex of hexes) {
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [
        number,
        number,
        number,
      ];
      const isPurple = b > r && r > g && b - g > 60;
      expect(isPurple, `${hex} reads as purple`).toBe(false);
    }
  });
});
