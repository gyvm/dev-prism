// Single source of truth for the DESIGN.md palette.
//
// Before this module the same values were hand-written in three places
// (docs/explore-views-plan.md issue ③): the PAGE_STYLES `:root` block, the
// `@theme` block in theme.css, and raw hex literals in the Explore shell CSS.
// Consumers now derive from here instead:
//
//   - src/renderers/page-styles.ts  → renderRootCss() for the frozen report
//   - src/web/shell/explore-styles.ts → renderRootCss() for Explore, so Explore
//     keeps its tokens once Step 4 stops injecting PAGE_STYLES
//   - src/ui/theme.css → still literal, because Tailwind's CSS-first config
//     cannot import TypeScript. tokens.test.ts asserts the two agree, so drift
//     fails the suite instead of shipping.
//
// Deps-free on purpose: the browser bundle imports this, so it must not reach
// for node: builtins.

/** DESIGN.md tokens, in the order they are emitted. */
export const DESIGN_TOKENS: Readonly<Record<string, string>> = {
  "bg-default": "#f7f9fc",
  "bg-muted": "#eef3f8",
  panel: "#ffffff",
  "panel-subtle": "#f5f8fb",
  "fg-default": "#202733",
  "fg-muted": "#586574",
  "fg-subtle": "#728091",
  "border-default": "#d6dee8",
  "border-muted": "#e2e8f0",
  "accent-cyan": "#0891b2",
  "accent-blue": "#2563eb",
  success: "#1f8f5f",
  attention: "#b7791f",
  danger: "#c2413a",
  "timeline-rail": "#eef3f8",
  "timeline-grid": "rgba(88,101,116,.13)",
  "tooltip-border": "rgba(214,222,232,.95)",
  "tooltip-bg": "rgba(255,255,255,.98)",
  shadow: "0 1px 2px rgba(32,39,51,.04), 0 8px 24px rgba(32,39,51,.06)",
  "role-human": "var(--accent-blue)",
  "role-human-fill": "rgba(37,99,235,.10)",
  "role-human-line": "rgba(37,99,235,.20)",
  "role-bot": "var(--attention)",
  "role-bot-fill": "rgba(183,121,31,.12)",
  "role-bot-line": "rgba(183,121,31,.24)",
};

/**
 * The `:root` declaration carrying every token.
 *
 * Byte-identical to the block it replaced, so the frozen-report output does not
 * change: same order, same single-space separators, same `color-scheme` lead.
 */
export function renderRootCss(): string {
  const declarations = Object.entries(DESIGN_TOKENS)
    .map(([name, value]) => `--${name}:${value};`)
    .join(" ");
  return `:root { color-scheme: light; ${declarations} }`;
}
