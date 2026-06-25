import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The generator is a plain .mjs outside the TS program (scripts/ is not in
// tsconfig include); this test is build-excluded, so importing it untyped at
// runtime is intentional — vitest resolves the .mjs named export directly.
import { buildGeneratedSource } from "../../scripts/gen-prompts.mjs";

// generated.ts is committed (so tsx test/dev runs and the tsc/Docker build pick
// it up without a build step — ADR 0002 §2). This guards against it drifting
// from src/prompts/*.md: regenerate in memory and compare to the committed file.
describe("src/prompts/generated.ts", () => {
  it("is in sync with src/prompts/*.md (run `npm run gen:prompts`)", () => {
    const committed = readFileSync(
      fileURLToPath(new URL("./generated.ts", import.meta.url)),
      "utf8",
    );
    expect(committed).toBe(buildGeneratedSource());
  });
});
