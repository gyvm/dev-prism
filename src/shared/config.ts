import { ConfigError } from "./errors.js";
import { isValidTimezone } from "./timezone.js";
import type { RepositorySpec } from "./types.js";

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

function parseRepositoryString(input: string, source: string): RepositorySpec {
  const trimmed = input.trim();
  const parts = trimmed.split("/");
  const fail = (reason: string): never => {
    throw new ConfigError(
      `Invalid repository entry "${input}" (${source}): ${reason}. Expected "owner/name" or "owner/*".`,
    );
  };

  if (parts.length !== 2) {
    fail('expected exactly one "/"');
  }
  const [ownerPart, namePart] = parts as [string, string];
  const owner = ownerPart.trim();
  const name = namePart.trim();
  if (!owner) fail("owner is empty");
  if (!name) fail("name is empty");
  if (owner === "*") fail("owner wildcard is not supported");
  if (!OWNER_PATTERN.test(owner)) fail(`owner "${owner}" contains invalid characters`);

  if (name === "*") {
    return { kind: "wildcard", owner };
  }
  if (!NAME_PATTERN.test(name)) {
    fail(`name "${name}" contains invalid characters`);
  }
  return { kind: "concrete", owner, name };
}

function specKey(spec: RepositorySpec): string {
  return spec.kind === "wildcard"
    ? `${spec.owner.toLowerCase()}/*`
    : `${spec.owner.toLowerCase()}/${spec.name.toLowerCase()}`;
}

function parseAndDedupeRepositories(
  inputs: readonly string[],
  source: string,
): RepositorySpec[] {
  const specs = inputs.map((input) => parseRepositoryString(input, source));
  const seen = new Set<string>();
  const wildcardOwners = new Set<string>();
  for (const spec of specs) {
    const key = specKey(spec);
    if (seen.has(key)) {
      throw new ConfigError(`Repositories (${source}) contain a duplicate entry for ${key}`);
    }
    seen.add(key);
    if (spec.kind === "wildcard") {
      wildcardOwners.add(spec.owner.toLowerCase());
    }
  }
  for (const spec of specs) {
    if (spec.kind === "concrete" && wildcardOwners.has(spec.owner.toLowerCase())) {
      throw new ConfigError(
        `Repositories (${source}) mix wildcard "${spec.owner}/*" with concrete entry "${spec.owner}/${spec.name}". Choose one form per owner.`,
      );
    }
  }
  return specs;
}

/**
 * Parse a `--repositories` / Action `repositories` input into specs.
 * Accepts whitespace- or comma-separated `owner/name` / `owner/*` entries.
 */
export function parseRepositoriesArg(input: string): RepositorySpec[] {
  const entries = input
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) {
    throw new ConfigError(
      'No repositories specified. Provide at least one "owner/name" or "owner/*".',
    );
  }
  return parseAndDedupeRepositories(entries, "--repositories");
}

export const DEFAULT_TIMEZONE = "UTC";

/** Resolve and validate a timezone string, defaulting to UTC when absent. */
export function resolveTimezone(value?: string): string {
  const tz = value?.trim();
  if (!tz) return DEFAULT_TIMEZONE;
  if (!isValidTimezone(tz)) {
    throw new ConfigError(`Invalid IANA timezone: "${tz}"`);
  }
  return tz;
}

export type LimitsConfig = Readonly<{
  maxPrs: number;
  maxCommentsPerPr: number;
  maxReviewThreadsPerPr: number;
  maxFilesPerPr: number;
  maxCommitsPerPr: number;
  maxBodyLength: number;
}>;

/**
 * Per-PR fetch limits. Hardcoded to keep the tool zero-config; tuning these is
 * a rare advanced need that can be re-exposed as flags later if required.
 */
export const DEFAULT_LIMITS: LimitsConfig = {
  maxPrs: 50,
  maxCommentsPerPr: 80,
  maxReviewThreadsPerPr: 60,
  maxFilesPerPr: 120,
  maxCommitsPerPr: 80,
  maxBodyLength: 4_000,
};

export type AiConfig = Readonly<{
  model?: string;
}>;

export type BotsConfig = Readonly<{
  patterns: readonly string[];
}>;

/**
 * Default bot-login matchers (case-insensitive regexes). Covers the common
 * GitHub app suffix `…[bot]` plus the well-known automation accounts.
 */
export const DEFAULT_BOT_PATTERNS: readonly string[] = [
  "\\[bot\\]$",
  "^dependabot$",
  "^renovate(-bot)?$",
  "^github-actions$",
  "^copilot$",
];

export const DEFAULT_BOTS: BotsConfig = { patterns: DEFAULT_BOT_PATTERNS };

export type UnifiedConfig = Readonly<{
  timezone: string;
  repositories: readonly RepositorySpec[];
  limits: LimitsConfig;
  ai: AiConfig;
  bots: BotsConfig;
}>;
