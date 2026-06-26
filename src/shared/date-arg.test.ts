import { describe, expect, it } from "vitest";
import { parseDateArg } from "./date-arg.js";

describe("parseDateArg", () => {
  it("parses a plain ISO date at UTC midnight", () => {
    expect(parseDateArg("--from", "2026-01-01").toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("normalizes a unicode minus (U+2212) from IME input", () => {
    expect(parseDateArg("--from", "2026−01−01").toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("normalizes fullwidth hyphen and digits", () => {
    // ２０２６－０１－０１ (fullwidth digits + U+FF0D)
    expect(parseDateArg("--from", "２０２６－０１－０１").toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("rejects a malformed string", () => {
    expect(() => parseDateArg("--from", "01/01/2026")).toThrow(/expects YYYY-MM-DD/);
  });

  it("rejects a calendar-invalid date", () => {
    expect(() => parseDateArg("--from", "2026-02-30")).toThrow(/not a valid calendar date/);
  });

  it("rejects undefined", () => {
    expect(() => parseDateArg("--from", undefined)).toThrow(/expects YYYY-MM-DD/);
  });
});
