import { describe, expect, it } from "vitest";

import { getReviewerIdentifier } from "./graphql.js";

describe("getReviewerIdentifier", () => {
  it("returns login when present", () => {
    expect(getReviewerIdentifier({ login: "alice", slug: "team-a", name: "Alice" })).toBe("alice");
  });

  it("falls back to slug when login is absent", () => {
    expect(getReviewerIdentifier({ slug: "platform-team", name: "Platform Team" })).toBe("platform-team");
  });

  it("falls back to name when login and slug are absent", () => {
    expect(getReviewerIdentifier({ name: "Some Name" })).toBe("Some Name");
  });

  it("returns null when all fields are absent", () => {
    expect(getReviewerIdentifier({})).toBeNull();
  });

  it("returns null for null input", () => {
    expect(getReviewerIdentifier(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(getReviewerIdentifier(undefined)).toBeNull();
  });
});
