import React, { useEffect } from "react";
import type { Preview } from "@storybook/react-vite";

import { PAGE_STYLES } from "../src/renderers/page-styles.js";
import { EXPLORE_STYLES } from "../src/web/shell/explore-styles.js";

// Same stylesheet Layout.astro loads: Tailwind v4 + the `ghinsights` daisyUI
// theme (default: true, so no data-theme attribute is needed).
import "../src/ui/theme.css";
// Prism candidate theme (design evaluation), active only while <html>
// carries .prism — the shipped design is untouched (see .storybook/prism/).
import "./prism/tokens.css";
import "./prism/overrides.css";

// Mirror pages/explore/[view].astro, which injects both sheets with is:global.
// The chart components resolve their palette (--accent-blue, .bg-node,
// .metric-card, …) from PAGE_STYLES' :root block — without it every var()
// falls back to black.
const sheet = document.createElement("style");
sheet.textContent = `${PAGE_STYLES}\n${EXPLORE_STYLES}`;
document.head.appendChild(sheet);

// PAGE_STYLES scopes page chrome to body/main; Explore views render inside
// <main>, so stories get the same wrapper. The theme toggle lives on <html>
// because the shipped :root tokens must be beatable from a higher-specificity
// scope (:root.prism) regardless of stylesheet order.
function ThemeFrame({
  design,
  mode,
  children,
}: {
  design: string;
  mode: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("prism", design === "prism");
    if (design === "prism") root.dataset.mode = mode;
    else delete root.dataset.mode;
  }, [design, mode]);
  return <main>{children}</main>;
}

const preview: Preview = {
  // Named exports are ignored when a default export exists, so the toolbar
  // definitions must live inside the preview object.
  globalTypes: {
    design: {
      description: "Visual system",
      toolbar: {
        title: "Design",
        icon: "paintbrush",
        dynamicTitle: true,
        items: [
          { value: "current", title: "Current (shipped)" },
          { value: "prism", title: "Prism (candidate)" },
        ],
      },
    },
    theme: {
      description: "Color scheme (Prism design only — Current has no dark mode)",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        dynamicTitle: true,
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
      },
    },
  },
  initialGlobals: { design: "current", theme: "light" },
  decorators: [
    (Story, context) => (
      <ThemeFrame
        design={(context.globals.design as string) ?? "current"}
        mode={(context.globals.theme as string) ?? "light"}
      >
        <Story />
      </ThemeFrame>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
