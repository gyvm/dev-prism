import { describe, expect, it } from "vitest";

import { datePresets } from "./date-presets.js";

describe("datePresets", () => {
  // Wed 2026-06-17 12:00 UTC.
  const now = new Date("2026-06-17T12:00:00.000Z");

  it("returns the four expected windows ending at now", () => {
    const presets = datePresets(now);
    expect(presets.map((p) => p.id)).toEqual(["this-week", "1m", "3m", "1y"]);
    for (const preset of presets) {
      expect(preset.to).toEqual(now);
    }
  });

  it("starts 今週 on Monday 00:00 UTC of the current week", () => {
    const [thisWeek] = datePresets(now);
    // 2026-06-17 is a Wednesday → Monday is 2026-06-15.
    expect(thisWeek?.from.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("computes rolling windows by day count", () => {
    const [, m1, m3, y1] = datePresets(now);
    expect(m1?.from.toISOString()).toBe("2026-05-18T12:00:00.000Z");
    expect(m3?.from.toISOString()).toBe("2026-03-19T12:00:00.000Z");
    expect(y1?.from.toISOString()).toBe("2025-06-17T12:00:00.000Z");
  });
});
