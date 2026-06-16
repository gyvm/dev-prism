import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { DuckDBConnection } from "@duckdb/node-api";
import type { DuckDBValue } from "@duckdb/node-api";

import { createBotLoginMatcher } from "../shared/bot.js";
import type { NormalizedPullRequest } from "../shared/types.js";
import { requirePrId } from "./identity.js";
import type { DwhRow } from "./rows.js";
import { valueForColumnType } from "./rows.js";
import { DWH_SCHEMA_VERSION, dwhTables, renderCreateTableSql, type DwhTableDefinition } from "./schema.js";
import { buildWarehouseRows } from "./transform.js";

export type BuildDwhOptions = Readonly<{
  dwhDir?: string;
  botPatterns?: readonly string[];
  now?: Date;
}>;

export type BuildDwhResult = Readonly<{
  dwhDir: string;
  changedPrCount: number;
  rowsByTable: Readonly<Record<string, number>>;
}>;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function tableName(prefix: string, table: DwhTableDefinition): string {
  return `${prefix}_${table.name}`;
}

function columnList(table: DwhTableDefinition, qualifier?: string): string {
  return table.columns
    .map((column) => qualifier ? `${qualifier}.${column.name}` : column.name)
    .join(", ");
}

function keyPredicate(table: DwhTableDefinition, leftAlias: string, rightAlias: string): string {
  return table.logicalPrimaryKey
    .map((column) => `${leftAlias}.${column} = ${rightAlias}.${column}`)
    .join(" AND ");
}

async function createWorkingTables(
  connection: DuckDBConnection,
  dwhDir: string,
): Promise<void> {
  for (const table of dwhTables) {
    await connection.run(renderCreateTableSql({ ...table, name: tableName("existing", table) }));
    await connection.run(renderCreateTableSql({ ...table, name: tableName("incoming", table) }));

    const parquetPath = join(dwhDir, `${table.name}.parquet`);
    if (await exists(parquetPath)) {
      await connection.run(
        `INSERT INTO ${tableName("existing", table)} (${columnList(table)})
         SELECT ${columnList(table)}
         FROM read_parquet(${sqlString(parquetPath)})`,
      );
    }
  }
}

async function insertRows(
  connection: DuckDBConnection,
  table: DwhTableDefinition,
  rows: readonly DwhRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const targetTable = tableName("incoming", table);
  const placeholders = table.columns.map(() => "?").join(", ");
  const sql = `INSERT INTO ${targetTable} (${columnList(table)}) VALUES (${placeholders})`;

  for (const row of rows) {
    const values = table.columns.map((column) =>
      valueForColumnType((row[column.name] ?? null) as DwhRow[string], column.type),
    ) as DuckDBValue[];
    await connection.run(sql, values);
  }
}

// Collapse incoming rows that share a logical primary key (keep the last
// occurrence). The final-table merge only de-dupes incoming against existing,
// so an intra-batch duplicate — e.g. the same path twice in one PR's files, a
// repeated label, or a duplicate commit oid — would otherwise be appended as a
// duplicate row and inflate aggregates. Parquet enforces no uniqueness.
function dedupeByPrimaryKey(table: DwhTableDefinition, rows: readonly DwhRow[]): readonly DwhRow[] {
  if (table.logicalPrimaryKey.length === 0) return rows;
  const byKey = new Map<string, DwhRow>();
  for (const row of rows) {
    const key = table.logicalPrimaryKey.map((column) => `${row[column] ?? ""}`).join("\u0000");
    byKey.set(key, row);
  }
  return [...byKey.values()];
}

async function insertIncomingRows(
  connection: DuckDBConnection,
  rowsByTable: Readonly<Record<string, readonly DwhRow[]>>,
): Promise<void> {
  for (const table of dwhTables) {
    await insertRows(connection, table, dedupeByPrimaryKey(table, rowsByTable[table.name] ?? []));
  }
}

async function createChangedPrIds(
  connection: DuckDBConnection,
  pullRequests: readonly NormalizedPullRequest[],
): Promise<string[]> {
  const changedPrIds = [...new Set(pullRequests.map((pr) => requirePrId(pr)))];
  await connection.run("CREATE TEMP TABLE changed_pr_ids (pr_id VARCHAR NOT NULL)");
  for (const prId of changedPrIds) {
    await connection.run("INSERT INTO changed_pr_ids VALUES (?)", [prId]);
  }
  return changedPrIds;
}

async function createFinalTable(connection: DuckDBConnection, table: DwhTableDefinition): Promise<void> {
  const existing = tableName("existing", table);
  const incoming = tableName("incoming", table);
  const final = tableName("final", table);

  if (table.name === "activity_actors") {
    await connection.run(`
      CREATE TEMP TABLE changed_event_ids AS
      SELECT event_id FROM existing_activities WHERE pr_id IN (SELECT pr_id FROM changed_pr_ids)
      UNION
      SELECT event_id FROM incoming_activities
    `);
    await connection.run(`
      CREATE TABLE ${final} AS
      SELECT ${columnList(table)} FROM ${existing}
      WHERE event_id NOT IN (SELECT event_id FROM changed_event_ids)
      UNION ALL BY NAME
      SELECT ${columnList(table)} FROM ${incoming}
    `);
    return;
  }

  if (table.name === "bodies") {
    await connection.run(`
      CREATE TEMP TABLE changed_body_keys AS
      SELECT pr_id AS subject_id, 'pr_body' AS subject_kind
      FROM existing_pull_requests
      WHERE pr_id IN (SELECT pr_id FROM changed_pr_ids)
      UNION
      SELECT review_id AS subject_id, 'review_body' AS subject_kind
      FROM existing_pr_reviews
      WHERE pr_id IN (SELECT pr_id FROM changed_pr_ids)
      UNION
      SELECT comment_id AS subject_id, 'review_comment' AS subject_kind
      FROM existing_pr_review_comments
      WHERE pr_id IN (SELECT pr_id FROM changed_pr_ids)
      UNION
      SELECT COALESCE(source_node_id, event_id) AS subject_id, 'issue_comment' AS subject_kind
      FROM existing_activities
      WHERE pr_id IN (SELECT pr_id FROM changed_pr_ids)
        AND event_type = 'comment_created'
      UNION
      SELECT subject_id, subject_kind
      FROM incoming_bodies
    `);
    await connection.run(`
      CREATE TABLE ${final} AS
      SELECT ${columnList(table, "e")}
      FROM ${existing} e
      WHERE NOT EXISTS (
        SELECT 1 FROM changed_body_keys k
        WHERE k.subject_id = e.subject_id AND k.subject_kind = e.subject_kind
      )
      UNION ALL BY NAME
      SELECT ${columnList(table)} FROM ${incoming}
    `);
    return;
  }

  if (table.columns.some((column) => column.name === "pr_id")) {
    await connection.run(`
      CREATE TABLE ${final} AS
      SELECT ${columnList(table)} FROM ${existing}
      WHERE pr_id NOT IN (SELECT pr_id FROM changed_pr_ids)
      UNION ALL BY NAME
      SELECT ${columnList(table)} FROM ${incoming}
    `);
    return;
  }

  if (table.name === "actors" || table.name === "repos") {
    await connection.run(`
      CREATE TABLE ${final} AS
      SELECT ${columnList(table, "e")}
      FROM ${existing} e
      WHERE NOT EXISTS (
        SELECT 1 FROM ${incoming} i
        WHERE ${keyPredicate(table, "i", "e")}
      )
      UNION ALL BY NAME
      SELECT ${columnList(table)} FROM ${incoming}
    `);
    return;
  }

  await connection.run(`
    CREATE TABLE ${final} AS
    SELECT ${columnList(table)} FROM ${existing}
    UNION ALL BY NAME
    SELECT ${columnList(table)} FROM ${incoming}
  `);
}

async function createFinalTables(connection: DuckDBConnection): Promise<void> {
  for (const table of dwhTables) {
    await createFinalTable(connection, table);
  }
}

async function writeParquetTables(connection: DuckDBConnection, stagingDir: string): Promise<void> {
  await mkdir(stagingDir, { recursive: true });

  for (const table of dwhTables) {
    const targetPath = join(stagingDir, `${table.name}.parquet`);
    await connection.run(
      `COPY (SELECT ${columnList(table)} FROM ${tableName("final", table)})
       TO ${sqlString(targetPath)}
       (FORMAT parquet)`,
    );
  }

  await writeFile(
    join(stagingDir, "_meta.json"),
    JSON.stringify({ dwh_schema_version: DWH_SCHEMA_VERSION }, null, 2) + "\n",
    "utf8",
  );
}

async function swapDwhDirectory(stagingDir: string, dwhDir: string): Promise<void> {
  const parent = dirname(dwhDir);
  await mkdir(parent, { recursive: true });
  const backupDir = join(parent, `.dwh-backup-${process.pid}-${Date.now()}`);

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

export async function buildDwhFromPullRequests(
  pullRequests: readonly NormalizedPullRequest[],
  options: BuildDwhOptions = {},
): Promise<BuildDwhResult> {
  const dwhDir = resolve(options.dwhDir ?? "data/dwh");
  const parent = dirname(dwhDir);
  const stagingDir = join(parent, `.dwh-staging-${process.pid}-${Date.now()}`);
  const isBotLogin = createBotLoginMatcher(options.botPatterns ?? []);
  const rowsByTable = buildWarehouseRows(pullRequests, isBotLogin);
  const rowCounts = Object.fromEntries(
    dwhTables.map((table) => [table.name, rowsByTable[table.name]?.length ?? 0]),
  );

  const connection = await DuckDBConnection.create();
  try {
    await createWorkingTables(connection, dwhDir);
    await insertIncomingRows(connection, rowsByTable);
    const changedPrIds = await createChangedPrIds(connection, pullRequests);
    await createFinalTables(connection);
    await writeParquetTables(connection, stagingDir);
    await swapDwhDirectory(stagingDir, dwhDir);

    return {
      dwhDir,
      changedPrCount: changedPrIds.length,
      rowsByTable: rowCounts,
    };
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    throw error;
  } finally {
    connection.closeSync();
  }
}
