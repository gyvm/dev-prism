import React, { useEffect } from "react";
import type { Preview } from "@storybook/react-vite";

import { PAGE_STYLES } from "../src/renderers/page-styles.js";
import { EXPLORE_STYLES } from "../src/web/shell/explore-styles.js";

// Same stylesheet Layout.astro loads: Tailwind v4 + the `ghinsights` daisyUI
// theme (default: true, so no data-theme attribute is needed).
import "../src/ui/theme.css";
// Basic candidate theme used for visual comparison (see .storybook/prism/).
// The adopted Explore-only rules live in EXPLORE_STYLES below.
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
  fullPage,
  children,
}: {
  design: string;
  fullPage: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("prism", design === "prism");
  }, [design]);
  return fullPage ? children : <main className="explore-main">{children}</main>;
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
          { value: "prism", title: "Basic (candidate)" },
        ],
      },
    },
  },
  initialGlobals: { design: "current" },
  decorators: [
    (Story, context) => (
      <ThemeFrame
        design={(context.globals.design as string) ?? "current"}
        fullPage={context.parameters.explorePage === true}
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
