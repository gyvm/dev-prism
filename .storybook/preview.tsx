import React from "react";
import type { Preview } from "@storybook/react-vite";

import { PAGE_STYLES } from "../src/renderers/page-styles.js";
import { EXPLORE_STYLES } from "../src/web/shell/explore-styles.js";

// Same stylesheet Layout.astro loads: Tailwind v4 + the `ghinsights` daisyUI
// theme (default: true, so no data-theme attribute is needed).
import "../src/ui/theme.css";

// Mirror pages/explore/[view].astro, which injects both sheets with is:global.
// The chart components resolve their palette (--accent-blue, .bg-node,
// .metric-card, …) from PAGE_STYLES' :root block — without it every var()
// falls back to black.
const sheet = document.createElement("style");
sheet.textContent = `${PAGE_STYLES}\n${EXPLORE_STYLES}`;
document.head.appendChild(sheet);

const preview: Preview = {
  decorators: [
    // PAGE_STYLES scopes page chrome to body/main; Explore views render inside
    // <main>, so stories get the same wrapper.
    (Story) => (
      <main>
        <Story />
      </main>
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
