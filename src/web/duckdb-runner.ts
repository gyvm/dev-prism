import * as duckdb from "@duckdb/duckdb-wasm";

import type { DwhQueryRunner } from "../warehouse/runner.js";
import { dwhTables, renderCreateTableSql } from "../warehouse/schema.js";

// DuckDB-WASM implementation of the DwhQueryRunner contract. It mirrors the
// native openDwh setup (warehouse/query.ts): every DWH table is exposed by its
// schema name as a view over its Parquet, or as an empty table when the Parquet
// is absent — so the exact same analysis SQL runs in the browser as on Node
// (design D4 parity). Parquet is fetched whole and registered as a buffer
// (registerFileBuffer), avoiding HTTP-range/CORS/httpfs concerns.

export type WasmRunner = DwhQueryRunner & Readonly<{ close: () => Promise<void> }>;

async function instantiate(): Promise<{ db: duckdb.AsyncDuckDB; worker: Worker }> {
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  // The CDN worker is cross-origin; wrap it in a same-origin blob that
  // importScripts the real worker, which the browser allows.
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }),
  );
  const worker = new Worker(workerUrl);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  return { db, worker };
}

function rowsFromArrow<T extends Record<string, unknown>>(table: {
  schema: { fields: ReadonlyArray<{ name: string }> };
  toArray(): ReadonlyArray<Record<string, unknown>>;
}): T[] {
  const fields = table.schema.fields.map((f) => f.name);
  return table.toArray().map((row) => {
    const out: Record<string, unknown> = {};
    for (const name of fields) out[name] = row[name];
    return out as T;
  });
}

/**
 * Boots DuckDB-WASM, registers each DWH table's Parquet (served from
 * `${dataBase}/<table>.parquet`) as a view, and returns a query runner.
 */
export async function createWasmRunner(dataBase = "data"): Promise<WasmRunner> {
  const { db, worker } = await instantiate();
  const connection = await db.connect();

  for (const table of dwhTables) {
    const fileName = `${table.name}.parquet`;
    const response = await fetch(`${dataBase}/${fileName}`);
    if (response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      await db.registerFileBuffer(fileName, bytes);
      await connection.query(
        `CREATE VIEW ${table.name} AS SELECT * FROM read_parquet('${fileName}')`,
      );
    } else if (response.status === 404) {
      // Table legitimately absent from this DWH → expose it empty (matches openDwh).
      await connection.query(renderCreateTableSql(table));
    } else {
      // A real transport/server error must not masquerade as "no data".
      throw new Error(`Failed to load ${fileName}: HTTP ${response.status} ${response.statusText}`);
    }
  }

  return {
    async all<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
      const table = await connection.query(sql);
      return rowsFromArrow<T>(table as unknown as Parameters<typeof rowsFromArrow>[0]);
    },
    async close(): Promise<void> {
      await connection.close();
      await db.terminate();
      worker.terminate();
    },
  };
}
