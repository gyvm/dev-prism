import { access, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { DWH_SCHEMA_VERSION } from "./schema.js";

// DWH migration framework (DWH-as-truth core): the warehouse cannot be rebuilt
// from raw (raw is transient), so schema changes are applied as ordered,
// idempotent migrations gated on `_meta.json`'s dwh_schema_version. Each run:
// version-gates, copies the DWH to a staging dir, applies the pending
// migrations there, stamps the new version, and atomically swaps it in. A
// failure leaves the committed DWH untouched.

const META_FILE = "_meta.json";

export type MigrationContext = Readonly<{ dwhDir: string }>;

export type Migration = Readonly<{
  /** Target version this migration produces (e.g. 2 migrates v1 → v2). */
  version: number;
  name: string;
  /** Transforms the Parquet files in `ctx.dwhDir` (a staging copy) in place. */
  up: (ctx: MigrationContext) => Promise<void>;
}>;

// No migrations yet: v1 is the baseline schema. New schema versions append here.
export const MIGRATIONS: readonly Migration[] = [];

export type MigrateResult = Readonly<{ from: number; to: number; applied: readonly string[] }>;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Reads the stored dwh_schema_version (0 when the DWH/meta does not exist). */
export async function readSchemaVersion(dwhDir: string): Promise<number> {
  try {
    const raw = await readFile(join(resolve(dwhDir), META_FILE), "utf8");
    const parsed = JSON.parse(raw) as { dwh_schema_version?: unknown };
    return typeof parsed.dwh_schema_version === "number" ? parsed.dwh_schema_version : 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

async function atomicSwap(stagingDir: string, dwhDir: string): Promise<void> {
  const parent = dirname(dwhDir);
  await mkdir(parent, { recursive: true });
  const backupDir = join(parent, `.dwh-migrate-backup-${process.pid}-${Date.now()}`);

  if (await exists(dwhDir)) {
    await rename(dwhDir, backupDir);
  }
  try {
    await rename(stagingDir, dwhDir);
    await rm(backupDir, { recursive: true, force: true });
  } catch (error) {
    if (await exists(backupDir)) {
      await rm(dwhDir, { recursive: true, force: true });
      await rename(backupDir, dwhDir);
    }
    throw error;
  }
}

/**
 * Applies pending migrations to bring the DWH up to `targetVersion`
 * (default DWH_SCHEMA_VERSION). Idempotent: a no-op when already current.
 * Throws if a migration for an intermediate version is missing, so the DWH is
 * never left at an inconsistent version.
 */
export async function migrateDwh(
  dwhDir: string,
  options: Readonly<{ migrations?: readonly Migration[]; targetVersion?: number }> = {},
): Promise<MigrateResult> {
  const root = resolve(dwhDir);
  const target = options.targetVersion ?? DWH_SCHEMA_VERSION;
  const registry = [...(options.migrations ?? MIGRATIONS)].sort((a, b) => a.version - b.version);
  const stored = await readSchemaVersion(root);

  // Refuse a DWH written by a newer engine: this version cannot safely read or
  // migrate it, and proceeding would let the build downgrade the version stamp.
  if (stored > target) {
    throw new Error(
      `DWH schema version ${stored} is newer than this engine supports (${target}); upgrade the engine`,
    );
  }
  if (stored === target) {
    return { from: stored, to: stored, applied: [] };
  }
  // No committed DWH yet (e.g. the first-ever build): nothing to migrate — the
  // build creates it fresh at the current schema version.
  if (!(await exists(root))) {
    return { from: stored, to: stored, applied: [] };
  }

  const pending = registry.filter((migration) => migration.version > stored && migration.version <= target);
  const haveVersions = new Set(pending.map((migration) => migration.version));
  const missing: number[] = [];
  for (let version = stored + 1; version <= target; version += 1) {
    if (!haveVersions.has(version)) missing.push(version);
  }
  if (missing.length > 0) {
    throw new Error(`Missing DWH migration(s) for version(s): ${missing.join(", ")}`);
  }

  const staging = join(dirname(root), `.dwh-migrate-${process.pid}-${Date.now()}`);
  await cp(root, staging, { recursive: true });
  try {
    const applied: string[] = [];
    for (const migration of pending) {
      await migration.up({ dwhDir: staging });
      applied.push(migration.name);
    }
    await writeFile(
      join(staging, META_FILE),
      `${JSON.stringify({ dwh_schema_version: target }, null, 2)}\n`,
      "utf8",
    );
    await atomicSwap(staging, root);
    return { from: stored, to: target, applied };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
