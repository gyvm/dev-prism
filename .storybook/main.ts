import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import type { StorybookConfig } from "@storybook/react-vite";

// Storybook is the design workbench for Explore views and their shared controls
// (docs/explore-screens.md). Stories feed fixtures to presentational components
// — DuckDB-WASM never runs here.
const config: StorybookConfig = {
  stories: ["../src/web/**/*.stories.tsx"],
  framework: "@storybook/react-vite",
  async viteFinal(config) {
    const { mergeConfig } = await import("vite");
    return mergeConfig(config, {
      // @storybook/react-vite does not add the React plugin itself (SB8+); the
      // app has no root vite.config.ts to inherit it from, so add it here.
      plugins: [react()],
      css: {
        // Tailwind v4 + daisyUI run via PostCSS. The config lives in src/web/
        // (the Astro root), not the repo root Storybook resolves from.
        postcss: fileURLToPath(new URL("../src/web", import.meta.url)),
      },
    });
  },
};

export default config;
