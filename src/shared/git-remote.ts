import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { RepositorySpec } from "./types.js";

const execFileAsync = promisify(execFile);

const GITHUB_REMOTE_PATTERN =
  /github\.com[/:]([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i;

/**
 * Extract `owner/name` from a GitHub remote URL.
 * Handles SSH (`git@github.com:owner/repo.git`), HTTPS
 * (`https://github.com/owner/repo(.git)?`) and `ssh://` forms.
 * Returns `null` for non-GitHub or unparseable URLs.
 */
export function parseGitHubRemote(url: string): RepositorySpec | null {
  const match = url.trim().match(GITHUB_REMOTE_PATTERN);
  if (!match) return null;
  const [, owner, name] = match as [string, string, string];
  return { kind: "concrete", owner, name };
}

/**
 * Best-effort inference of the current repository from `git`'s origin remote.
 * Returns `null` when not in a git repo, no origin remote, or a non-GitHub URL.
 */
export async function inferRepositoryFromGit(
  cwd: string = process.cwd(),
): Promise<RepositorySpec | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["config", "--get", "remote.origin.url"],
      { cwd },
    );
    return parseGitHubRemote(stdout);
  } catch {
    return null;
  }
}
