import * as duckdb from "@duckdb/duckdb-wasm";

import { siteBase } from "./base-path.js";
import type { DwhQueryRunner } from "../warehouse/runner.js";
import {
  dwhTables,
  exploreDwhTables,
  type DwhTableDefinition,
  renderCreateTableSql,
} from "../warehouse/schema.js";

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

type TableBufferResult = Readonly<
  | { table: DwhTableDefinition; kind: "buffer"; fileName: string; bytes: Uint8Array }
  | { table: DwhTableDefinition; kind: "missing" }
>;

/** Fetches one table's Parquet; 404 means the table is legitimately absent. */
export async function fetchTableBuffer(
  dataBase: string,
  table: DwhTableDefinition,
  signal?: AbortSignal,
): Promise<TableBufferResult> {
  const fileName = `${table.name}.parquet`;
  const response = await fetch(`${dataBase}/${fileName}`, { signal });
  if (response.ok) {
    return { table, kind: "buffer", fileName, bytes: new Uint8Array(await response.arrayBuffer()) };
  }
  if (response.status === 404) {
    // Table legitimately absent from this DWH → expose it empty (matches openDwh).
    return { table, kind: "missing" };
  }
  // A real transport/server error must not masquerade as "no data".
  throw new Error(`Failed to load ${fileName}: HTTP ${response.status} ${response.statusText}`);
}

/** Fetches every Explore table's Parquet concurrently (order preserved in the result). */
export async function fetchAllTableBuffers(dataBase: string): Promise<TableBufferResult[]> {
  // Any one failure discards the whole load, so cancel the siblings still in
  // flight rather than let multi-MB downloads run to completion for a result
  // nobody will read.
  const controller = new AbortController();
  try {
    return await Promise.all(
      exploreDwhTables.map((table) => fetchTableBuffer(dataBase, table, controller.signal)),
    );
  } catch (error) {
    controller.abort();
    throw error;
  }
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
 * Boots DuckDB-WASM and registers each Explore table's Parquet (served from
 * `${dataBase}/<table>.parquet`) as a view. Other DWH tables are represented
 * by empty schemas: browser code keeps the prior missing-table contract while
 * source text remains out of the static deployment.
 *
 * The default base is resolved against the site root (`import.meta.env.BASE_URL`),
 * not the current page, so it works regardless of which route Explore is served
 * from (e.g. `/explore/` under Astro) and respects the GitHub Pages project base
 * path (`/<repo>/`). Parquet is emitted at `<base>/data/*` by the build's
 * publicDir copy.
 */
function defaultDataBase(): string {
  return `${siteBase()}data`;
}

export async function createWasmRunner(dataBase = defaultDataBase()): Promise<WasmRunner> {
  // The WASM boot (multi-MB download + compile) and the Parquet fetches are
  // independent, so they run concurrently; serializing them was the dominant
  // cost of the old implementation. Per-table semantics are unchanged — only
  // which failure surfaces first differs when several tables fail at once.
  const [{ db, worker }, results] = await Promise.all([
    instantiate(),
    fetchAllTableBuffers(dataBase),
  ]);
  const connection = await db.connect();

  const resultByTable = new Map(results.map((result) => [result.table.name, result]));
  for (const table of dwhTables) {
    const result = resultByTable.get(table.name);
    if (result?.kind === "buffer") {
      await db.registerFileBuffer(result.fileName, result.bytes);
      await connection.query(
        `CREATE VIEW ${result.table.name} AS SELECT * FROM read_parquet('${result.fileName}')`,
      );
    } else {
      await connection.query(renderCreateTableSql(table));
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
