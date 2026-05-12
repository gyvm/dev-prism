import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";

import { ConfigError } from "./errors.js";
import { isValidTimezone } from "./timezone.js";
import type { RepoConfig, RepositorySpec } from "./types.js";

const generalSchema = z
  .object({
    timezone: z
      .string()
      .default("UTC")
      .refine((tz) => isValidTimezone(tz), { message: "invalid IANA timezone" }),
  })
  .default({ timezone: "UTC" });

const repositoriesSchema = z.object({
  include: z
    .array(z.string().trim().min(1, "repository entry must not be empty"))
    .min(1, "at least one repository is required"),
});

const baseConfigSchema = z.object({
  general: generalSchema,
  repositories: repositoriesSchema,
});

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

function parseRepositoryString(input: string, resolvedPath: string): RepositorySpec {
  const trimmed = input.trim();
  const parts = trimmed.split("/");
  const fail = (reason: string): never => {
    throw new ConfigError(
      `Repository config at ${resolvedPath} has invalid entry "${input}": ${reason}. Expected "owner/name" or "owner/*".`,
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

const limitsSchema = z
  .object({
    maxPrs: z.number().int().positive().optional(),
    maxCommentsPerPr: z.number().int().positive().optional(),
    maxReviewThreadsPerPr: z.number().int().positive().optional(),
    maxFilesPerPr: z.number().int().positive().optional(),
    maxCommitsPerPr: z.number().int().positive().optional(),
    maxBodyLength: z.number().int().positive().optional(),
  })
  .default({});

const aiSchema = z
  .object({
    model: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().trim().min(1).optional(),
    ),
  })
  .default({});

const botsSchema = z
  .object({
    patterns: z
      .array(z.string())
      .default([])
      .superRefine((patterns, ctx) => {
        patterns.forEach((pattern, index) => {
          try {
            new RegExp(pattern);
          } catch (error) {
            ctx.addIssue({
              code: "custom",
              path: [index],
              message: `invalid regular expression: ${String(error)}`,
            });
          }
        });
      }),
  })
  .default({ patterns: [] });

const unifiedConfigSchema = baseConfigSchema.extend({
  limits: limitsSchema,
  ai: aiSchema,
  bots: botsSchema,
});

export type LimitsConfig = Readonly<{
  maxPrs: number;
  maxCommentsPerPr: number;
  maxReviewThreadsPerPr: number;
  maxFilesPerPr: number;
  maxCommitsPerPr: number;
  maxBodyLength: number;
}>;

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

export type UnifiedConfig = Readonly<{
  timezone: string;
  repositories: readonly RepositorySpec[];
  limits: LimitsConfig;
  ai: AiConfig;
  bots: BotsConfig;
}>;

function specKey(spec: RepositorySpec): string {
  return spec.kind === "wildcard"
    ? `${spec.owner.toLowerCase()}/*`
    : `${spec.owner.toLowerCase()}/${spec.name.toLowerCase()}`;
}

function parseAndDedupeRepositories(
  inputs: readonly string[],
  resolvedPath: string,
): RepositorySpec[] {
  const specs = inputs.map((input) => parseRepositoryString(input, resolvedPath));
  const seen = new Set<string>();
  const wildcardOwners = new Set<string>();
  for (const spec of specs) {
    const key = specKey(spec);
    if (seen.has(key)) {
      throw new ConfigError(
        `Repository config at ${resolvedPath} contains a duplicate entry for ${key}`,
      );
    }
    seen.add(key);
    if (spec.kind === "wildcard") {
      wildcardOwners.add(spec.owner.toLowerCase());
    }
  }
  for (const spec of specs) {
    if (spec.kind === "concrete" && wildcardOwners.has(spec.owner.toLowerCase())) {
      throw new ConfigError(
        `Repository config at ${resolvedPath} mixes wildcard "${spec.owner}/*" with concrete entry "${spec.owner}/${spec.name}". Choose one form per owner.`,
      );
    }
  }
  return specs;
}

async function readToml(path: string): Promise<unknown> {
  const resolvedPath = resolve(path);
  let raw: string;
  try {
    raw = await readFile(resolvedPath, "utf8");
  } catch (error) {
    throw new ConfigError(`Failed to read config at ${resolvedPath}: ${String(error)}`);
  }
  try {
    return parseToml(raw);
  } catch (error) {
    throw new ConfigError(`Config at ${resolvedPath} is not valid TOML: ${String(error)}`);
  }
}

export async function loadRepoConfig(configPath = "config.toml"): Promise<RepoConfig> {
  const resolvedPath = resolve(configPath);
  const parsedJson = await readToml(configPath);
  const parsedConfig = baseConfigSchema.safeParse(parsedJson);
  if (!parsedConfig.success) {
    throw new ConfigError(
      `Repository config at ${resolvedPath} is invalid: ${parsedConfig.error.issues
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join(", ")}`,
    );
  }
  const repositories = parseAndDedupeRepositories(
    parsedConfig.data.repositories.include,
    resolvedPath,
  );
  return { repositories, timezone: parsedConfig.data.general.timezone };
}

export async function loadUnifiedConfig(configPath = "config.toml"): Promise<UnifiedConfig> {
  const resolvedPath = resolve(configPath);
  const parsedJson = await readToml(configPath);
  const parsed = unifiedConfigSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new ConfigError(
      `Unified config at ${resolvedPath} is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join(", ")}`,
    );
  }

  const repositories = parseAndDedupeRepositories(
    parsed.data.repositories.include,
    resolvedPath,
  );
  const rawLimits = parsed.data.limits;
  const limits: LimitsConfig = {
    maxPrs: rawLimits.maxPrs ?? DEFAULT_LIMITS.maxPrs,
    maxCommentsPerPr: rawLimits.maxCommentsPerPr ?? DEFAULT_LIMITS.maxCommentsPerPr,
    maxReviewThreadsPerPr: rawLimits.maxReviewThreadsPerPr ?? DEFAULT_LIMITS.maxReviewThreadsPerPr,
    maxFilesPerPr: rawLimits.maxFilesPerPr ?? DEFAULT_LIMITS.maxFilesPerPr,
    maxCommitsPerPr: rawLimits.maxCommitsPerPr ?? DEFAULT_LIMITS.maxCommitsPerPr,
    maxBodyLength: rawLimits.maxBodyLength ?? DEFAULT_LIMITS.maxBodyLength,
  };

  return {
    timezone: parsed.data.general.timezone,
    repositories,
    limits,
    ai: {
      ...(parsed.data.ai.model ? { model: parsed.data.ai.model } : {}),
    },
    bots: {
      patterns: parsed.data.bots.patterns,
    },
  };
}
