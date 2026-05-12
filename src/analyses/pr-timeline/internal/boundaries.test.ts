import { describe, it, expect } from "vitest";
import { earliest } from "./boundaries.js";
import { MetricsError } from "../../../shared/errors.js";

describe("earliest", () => {
  it("returns null for an empty list", () => {
    expect(earliest([])).toBeNull();
  });

  it("skips null and undefined entries", () => {
    expect(earliest([null, undefined, "2026-03-01T00:00:00.000Z"])).toBe(
      "2026-03-01T00:00:00.000Z",
    );
    expect(earliest([null, undefined])).toBeNull();
  });

  it("returns the chronologically earliest value among same-length Z-suffixed ISO strings", () => {
    const values = [
      "2026-03-02T00:00:00.000Z",
      "2026-03-01T06:00:00.000Z",
      "2026-03-01T12:00:00.000Z",
    ];
    expect(earliest(values)).toBe("2026-03-01T06:00:00.000Z");
  });

  it("orders by absolute time, not lexicographically, when offsets differ", () => {
    // "2026-03-01T00:00:00+09:00" == "2026-02-28T15:00:00Z" (the absolute earliest)
    // Lexicographic sort would pick "2026-02-28..." but only by accident.
    // Use a case that lexicographic compare would get WRONG:
    // "2026-03-01T01:00:00+09:00" == "2026-02-28T16:00:00Z" (earlier in real time)
    // vs "2026-03-01T00:00:00Z" (later in real time but lex-smaller string)
    const values = [
      "2026-03-01T00:00:00Z",
      "2026-03-01T01:00:00+09:00",
    ];
    expect(earliest(values)).toBe("2026-03-01T01:00:00+09:00");
  });

  it("throws MetricsError on an invalid date string", () => {
    expect(() => earliest(["2026-03-01T00:00:00.000Z", "not-a-date"])).toThrow(
      MetricsError,
    );
  });
});
