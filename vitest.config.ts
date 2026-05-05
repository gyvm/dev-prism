import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "/tmp/gh-insights-vitest-cache",
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["web/**"],
  },
});
