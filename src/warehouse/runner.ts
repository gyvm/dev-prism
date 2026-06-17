// Deps-free query-runner contract shared by the DuckDB-native runner (Reports,
// `warehouse/query.ts`) and the DuckDB-WASM runner (Explore). Kept free of any
// Node-only imports (`@duckdb/node-api`, `node:fs`) so the browser bundle can
// `import type` it without pulling those in. No query function passes `params`
// today (scope is escaped into SQL literals), so it is typed loosely and may be
// ignored by an implementation.
export type DwhQueryRunner = Readonly<{
  /** Runs a SELECT and returns plain row objects. */
  all<T extends Record<string, unknown>>(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<T[]>;
}>;
