import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";

import { ConfigError } from "./errors.js";
import { isValidTimezone } from "./timezone.js";
import type { RepoConfig, RepositorySpec } from "./types.js";

const repoConfigSchema = z.object({
  timezone: z
    .string()
    .default("UTC")
    .refine((tz) => isValidTimezone(tz), { message: "invalid IANA timezone" }),
  repositories: z
    .array(z.string().trim().min(1, "repository entry must not be empty"))
    .min(1, "at least one repository is required"),
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

const capsSchema = z
  .object({
    maxPrs: z.number().int().positive().optional(),
    maxCommentsPerPr: z.number().int().positive().optional(),
    maxReviewThreadsPerPr: z.number().int().positive().optional(),
    maxFilesPerPr: z.number().int().positive().optional(),
    maxCommitsPerPr: z.number().int().positive().optional(),
    maxBodyLength: z.number().int().positive().optional(),
  })
  .default({});

const analysesSchema = z
  .object({
    disabled: z.array(z.string()).default([]),
    overrides: z
      .record(z.string(), z.record(z.string(), z.unknown()))
      .default({}),
  })
  .default({ disabled: [], overrides: {} });

const aiSchema = z
  .object({
    model: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().trim().min(1).optional(),
    ),
  })
  .default({});

const actorsSchema = z
  .object({
    botLoginPatterns: z
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
  .default({ botLoginPatterns: [] });

const unifiedConfigSchema = repoConfigSchema.extend({
  caps: capsSchema,
  analyses: analysesSchema,
  ai: aiSchema,
  actors: actorsSchema,
});

export type CapsConfig = Readonly<{
  maxPrs: number;
  maxCommentsPerPr: number;
  maxReviewThreadsPerPr: number;
  maxFilesPerPr: number;
  maxCommitsPerPr: number;
  maxBodyLength: number;
}>;

export const DEFAULT_CAPS: CapsConfig = {
  maxPrs: 50,
  maxCommentsPerPr: 80,
  maxReviewThreadsPerPr: 60,
  maxFilesPerPr: 120,
  maxCommitsPerPr: 80,
  maxBodyLength: 4_000,
};

export type AnalysesConfig = Readonly<{
  disabled: readonly string[];
  overrides: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}>;

export type AiConfig = Readonly<{
  model?: string;
}>;

export type ActorsConfig = Readonly<{
  botLoginPatterns: readonly string[];
}>;

export type UnifiedConfig = Readonly<{
  timezone: string;
  repositories: readonly RepositorySpec[];
  caps: CapsConfig;
  analyses: AnalysesConfig;
  ai: AiConfig;
  actors: ActorsConfig;
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
  const parsedConfig = repoConfigSchema.safeParse(parsedJson);
  if (!parsedConfig.success) {
    throw new ConfigError(
      `Repository config at ${resolvedPath} is invalid: ${parsedConfig.error.issues
        .map((issue) => issue.message)
        .join(", ")}`,
    );
  }
  const repositories = parseAndDedupeRepositories(parsedConfig.data.repositories, resolvedPath);
  return { repositories, timezone: parsedConfig.data.timezone };
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

  const repositories = parseAndDedupeRepositories(parsed.data.repositories, resolvedPath);
  const rawCaps = parsed.data.caps;
  const caps: CapsConfig = {
    maxPrs: rawCaps.maxPrs ?? DEFAULT_CAPS.maxPrs,
    maxCommentsPerPr: rawCaps.maxCommentsPerPr ?? DEFAULT_CAPS.maxCommentsPerPr,
    maxReviewThreadsPerPr: rawCaps.maxReviewThreadsPerPr ?? DEFAULT_CAPS.maxReviewThreadsPerPr,
    maxFilesPerPr: rawCaps.maxFilesPerPr ?? DEFAULT_CAPS.maxFilesPerPr,
    maxCommitsPerPr: rawCaps.maxCommitsPerPr ?? DEFAULT_CAPS.maxCommitsPerPr,
    maxBodyLength: rawCaps.maxBodyLength ?? DEFAULT_CAPS.maxBodyLength,
  };

  return {
    timezone: parsed.data.timezone,
    repositories,
    caps,
    analyses: {
      disabled: parsed.data.analyses.disabled,
      overrides: parsed.data.analyses.overrides,
    },
    ai: {
      ...(parsed.data.ai.model ? { model: parsed.data.ai.model } : {}),
    },
    actors: {
      botLoginPatterns: parsed.data.actors.botLoginPatterns,
    },
  };
}
