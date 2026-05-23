import { describe, expect, it } from "vitest";

import { parseGitHubRemote } from "./git-remote.js";

describe("parseGitHubRemote", () => {
  it("parses an SSH remote", () => {
    expect(parseGitHubRemote("git@github.com:gyvm/pr-weekly-report.git")).toEqual({
      kind: "concrete",
      owner: "gyvm",
      name: "pr-weekly-report",
    });
  });

  it("parses an HTTPS remote with .git suffix", () => {
    expect(parseGitHubRemote("https://github.com/gyvm/pr-weekly-report.git")).toEqual({
      kind: "concrete",
      owner: "gyvm",
      name: "pr-weekly-report",
    });
  });

  it("parses an HTTPS remote without .git suffix and trailing slash", () => {
    expect(parseGitHubRemote("https://github.com/gyvm/pr-weekly-report/")).toEqual({
      kind: "concrete",
      owner: "gyvm",
      name: "pr-weekly-report",
    });
  });

  it("parses an ssh:// remote", () => {
    expect(parseGitHubRemote("ssh://git@github.com/openai/codex.git")).toEqual({
      kind: "concrete",
      owner: "openai",
      name: "codex",
    });
  });

  it("ignores trailing whitespace/newline from git output", () => {
    expect(parseGitHubRemote("git@github.com:openai/codex.git\n")).toEqual({
      kind: "concrete",
      owner: "openai",
      name: "codex",
    });
  });

  it("returns null for non-GitHub hosts", () => {
    expect(parseGitHubRemote("git@gitlab.com:foo/bar.git")).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(parseGitHubRemote("not a url")).toBeNull();
  });
});
