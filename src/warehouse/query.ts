import { access } from "node:fs/promises";
import { join, resolve } from "node:path";

import { DuckDBConnection } from "@duckdb/node-api";
import type { DuckDBValue } from "@duckdb/node-api";

import { dwhTables, renderCreateTableSql } from "./schema.js";

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

export type DwhQueryRunner = Readonly<{
  /** Runs a SELECT and returns plain row objects. */
  all<T extends Record<string, unknown>>(
    sql: string,
    params?: Record<string, DuckDBValue>,
  ): Promise<T[]>;
}>;

export type DwhHandle = Readonly<{
  runner: DwhQueryRunner;
  close: () => void;
}>;

/**
 * Opens a DWH directory as a set of queryable relations. Each table is exposed
 * by its schema name (`pull_requests`, `activities`, `actors`, …) so analysis
 * SQL is identical whether it runs here (DuckDB native, Reports) or in
 * DuckDB-WASM (Explore). Tables without a Parquet file yet are created empty so
 * queries never error on a partially-populated DWH.
 */
export async function openDwh(dwhDir: string): Promise<DwhHandle> {
  const root = resolve(dwhDir);
  const connection = await DuckDBConnection.create();

  for (const table of dwhTables) {
    const parquetPath = join(root, `${table.name}.parquet`);
    if (await exists(parquetPath)) {
      await connection.run(
        `CREATE VIEW ${table.name} AS SELECT * FROM read_parquet(${sqlString(parquetPath)})`,
      );
    } else {
      await connection.run(renderCreateTableSql(table));
    }
  }

  const runner: DwhQueryRunner = {
    async all<T extends Record<string, unknown>>(
      sql: string,
      params?: Record<string, DuckDBValue>,
    ): Promise<T[]> {
      const reader = params
        ? await connection.runAndReadAll(sql, params)
        : await connection.runAndReadAll(sql);
      return reader.getRowObjects() as T[];
    },
  };

  return { runner, close: () => connection.closeSync() };
}

/** Opens the DWH, runs `fn`, and always closes the connection. */
export async function withDwh<T>(
  dwhDir: string,
  fn: (runner: DwhQueryRunner) => Promise<T>,
): Promise<T> {
  const handle = await openDwh(dwhDir);
  try {
    return await fn(handle.runner);
  } finally {
    handle.close();
  }
}
