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

  // The regex separates the U+2010–U+2015 range from the U+2212/U+FF0D
  // singletons; cover every codepoint in the range so a future edit that
  // collapses it (dropping en/em dash, the common macOS smart-dash artifacts)
  // can't pass silently.
  it.each([
    ["U+2010 hyphen", "2026‐01‐01"],
    ["U+2011 non-breaking hyphen", "2026‑01‑01"],
    ["U+2012 figure dash", "2026‒01‒01"],
    ["U+2013 en dash", "2026–01–01"],
    ["U+2014 em dash", "2026—01—01"],
    ["U+2015 horizontal bar", "2026―01―01"],
  ])("normalizes %s", (_label, input) => {
    expect(parseDateArg("--from", input).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("normalizes mixed ASCII and unicode separators", () => {
    expect(parseDateArg("--from", "2026-01−01").toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("normalizes a partial-fullwidth digit run", () => {
    // Only the first digit is fullwidth (２) — a realistic paste artifact.
    expect(parseDateArg("--from", "２026-01-01").toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("rejects a malformed string", () => {
    expect(() => parseDateArg("--from", "01/01/2026")).toThrow(/expects YYYY-MM-DD/);
  });

  it("rejects an empty string", () => {
    expect(() => parseDateArg("--from", "")).toThrow(/expects YYYY-MM-DD/);
  });

  it("does not trim surrounding whitespace", () => {
    expect(() => parseDateArg("--from", " 2026-01-01 ")).toThrow(/expects YYYY-MM-DD/);
  });

  it("rejects a calendar-invalid date", () => {
    expect(() => parseDateArg("--from", "2026-02-30")).toThrow(/not a valid calendar date/);
  });

  it("rejects a non-leap Feb 29 (roll-forward path)", () => {
    expect(() => parseDateArg("--from", "2026-02-29")).toThrow(/not a valid calendar date/);
  });

  it("accepts a leap-year Feb 29", () => {
    expect(parseDateArg("--from", "2024-02-29").toISOString()).toBe("2024-02-29T00:00:00.000Z");
  });

  it("rejects an out-of-range month (NaN path)", () => {
    expect(() => parseDateArg("--from", "2026-13-01")).toThrow(/not a valid calendar date/);
  });

  it("reports the original input — not the normalized form — when a normalized date is invalid", () => {
    // ２０２６－０２－３０ normalizes to a valid shape but an invalid calendar date;
    // the error must echo what the user actually typed.
    expect(() => parseDateArg("--from", "２０２６－０２－３０")).toThrow(/２０２６－０２－３０/);
  });

  it("rejects undefined", () => {
    expect(() => parseDateArg("--from", undefined)).toThrow(/expects YYYY-MM-DD/);
  });
});
