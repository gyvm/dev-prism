import { describe, it, expect } from "vitest";
import { diffHours } from "./datetime.js";

describe("diffHours", () => {
  it("returns 24 for timestamps exactly one day apart", () => {
    expect(
      diffHours("2026-03-01T00:00:00.000Z", "2026-03-02T00:00:00.000Z"),
    ).toBe(24);
  });

  it("returns fractional hours", () => {
    expect(
      diffHours("2026-03-01T00:00:00.000Z", "2026-03-01T01:30:00.000Z"),
    ).toBe(1.5);
  });

  it("returns 0 for identical timestamps", () => {
    expect(
      diffHours("2026-03-01T12:00:00.000Z", "2026-03-01T12:00:00.000Z"),
    ).toBe(0);
  });

  it("returns negative hours when end is before start", () => {
    expect(
      diffHours("2026-03-02T00:00:00.000Z", "2026-03-01T00:00:00.000Z"),
    ).toBe(-24);
  });

  it("throws on invalid start date", () => {
    expect(() => diffHours("not-a-date", "2026-03-01T00:00:00.000Z")).toThrow(
      /invalid start date/i,
    );
  });

  it("throws on invalid end date", () => {
    expect(() => diffHours("2026-03-01T00:00:00.000Z", "garbage")).toThrow(
      /invalid end date/i,
    );
  });
});
