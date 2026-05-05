import { describe, it, expect } from "vitest";
import { toDateSlug, getWeekBoundaries, isValidTimezone } from "./timezone.js";

describe("toDateSlug", () => {
  it("returns JST date for a UTC timestamp", () => {
    // 2026-03-15T15:00:00Z = 2026-03-16T00:00:00 JST
    expect(toDateSlug(new Date("2026-03-15T15:00:00.000Z"), "Asia/Tokyo")).toBe("2026-03-16");
  });

  it("returns UTC date when timezone is UTC", () => {
    expect(toDateSlug(new Date("2026-03-15T15:00:00.000Z"), "UTC")).toBe("2026-03-15");
  });

  it("handles JST date boundary — just before midnight JST", () => {
    // 2026-03-15T14:59:59Z = 2026-03-15T23:59:59 JST
    expect(toDateSlug(new Date("2026-03-15T14:59:59.000Z"), "Asia/Tokyo")).toBe("2026-03-15");
  });

  it("handles JST date boundary — at midnight JST", () => {
    // 2026-03-15T15:00:00Z = 2026-03-16T00:00:00 JST
    expect(toDateSlug(new Date("2026-03-15T15:00:00.000Z"), "Asia/Tokyo")).toBe("2026-03-16");
  });

  it("handles year boundary", () => {
    // 2025-12-31T15:00:00Z = 2026-01-01T00:00:00 JST
    expect(toDateSlug(new Date("2025-12-31T15:00:00.000Z"), "Asia/Tokyo")).toBe("2026-01-01");
  });
});

describe("getWeekBoundaries", () => {
  it("returns Monday 00:00 JST to Sunday 23:59:59.999 JST", () => {
    // 2026-03-18 Wednesday JST
    const date = new Date("2026-03-18T03:00:00.000Z"); // 2026-03-18T12:00 JST
    const { start, end } = getWeekBoundaries(date, "Asia/Tokyo");

    // Monday 2026-03-16T00:00:00 JST = 2026-03-15T15:00:00Z
    expect(start.toISOString()).toBe("2026-03-15T15:00:00.000Z");

    // Sunday 2026-03-22T23:59:59.999 JST = 2026-03-22T14:59:59.999Z
    expect(end.toISOString()).toBe("2026-03-22T14:59:59.999Z");
  });

  it("works for a Monday in JST", () => {
    // 2026-03-16T00:00:00 JST = 2026-03-15T15:00:00Z
    const date = new Date("2026-03-15T15:00:00.000Z");
    const { start } = getWeekBoundaries(date, "Asia/Tokyo");
    expect(start.toISOString()).toBe("2026-03-15T15:00:00.000Z");
  });

  it("works for a Sunday in JST", () => {
    // 2026-03-22T23:00:00 JST = 2026-03-22T14:00:00Z
    const date = new Date("2026-03-22T14:00:00.000Z");
    const { start, end } = getWeekBoundaries(date, "Asia/Tokyo");
    expect(start.toISOString()).toBe("2026-03-15T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-22T14:59:59.999Z");
  });

  it("handles UTC timezone with standard Monday-Sunday weeks", () => {
    const date = new Date("2026-03-18T12:00:00.000Z"); // Wednesday UTC
    const { start, end } = getWeekBoundaries(date, "UTC");
    expect(start.toISOString()).toBe("2026-03-16T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-22T23:59:59.999Z");
  });

  it("week boundary: Sunday 23:59 JST and Monday 00:00 JST are different weeks", () => {
    // Sunday 2026-03-22T23:59:59 JST = 2026-03-22T14:59:59Z
    const sundayEnd = new Date("2026-03-22T14:59:59.000Z");
    const sundayWeek = getWeekBoundaries(sundayEnd, "Asia/Tokyo");

    // Monday 2026-03-23T00:00:00 JST = 2026-03-22T15:00:00Z
    const mondayStart = new Date("2026-03-22T15:00:00.000Z");
    const mondayWeek = getWeekBoundaries(mondayStart, "Asia/Tokyo");

    expect(sundayWeek.start.toISOString()).not.toBe(mondayWeek.start.toISOString());
    // Sunday belongs to the week starting Mar 16
    expect(toDateSlug(sundayWeek.start, "Asia/Tokyo")).toBe("2026-03-16");
    // Monday belongs to the week starting Mar 23
    expect(toDateSlug(mondayWeek.start, "Asia/Tokyo")).toBe("2026-03-23");
  });
});

describe("isValidTimezone", () => {
  it("returns true for valid timezone", () => {
    expect(isValidTimezone("Asia/Tokyo")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
  });

  it("returns false for invalid timezone", () => {
    expect(isValidTimezone("Invalid/Timezone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("Fake/Zone123")).toBe(false);
  });
});
