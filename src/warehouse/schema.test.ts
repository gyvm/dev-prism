import { describe, expect, it } from "vitest";

import {
  DWH_SCHEMA_VERSION,
  dwhTables,
  getDwhTable,
  renderCreateTableSql,
  renderSchemaSql,
} from "./schema.js";

describe("DWH schema", () => {
  it("defines the initial analytics platform schema version", () => {
    expect(DWH_SCHEMA_VERSION).toBe(1);
  });

  it("contains the tables from the analytics platform design", () => {
    expect(dwhTables.map((table) => table.name)).toEqual([
      "activities",
      "activity_actors",
      "pull_requests",
      "pr_reviews",
      "pr_review_requests",
      "pr_review_threads",
      "pr_review_comments",
      "pr_commits",
      "pr_files",
      "pr_labels",
      "actors",
      "repos",
      "bodies",
    ]);
  });

  it("keeps logical primary key columns in each table definition", () => {
    for (const table of dwhTables) {
      const columnsByName = new Map(table.columns.map((column) => [column.name, column]));

      for (const keyColumn of table.logicalPrimaryKey) {
        expect(columnsByName.has(keyColumn), `${table.name}.${keyColumn}`).toBe(true);
      }
    }
  });

  it("renders DuckDB create table SQL", () => {
    expect(renderCreateTableSql(getDwhTable("activities"))).toContain(
      "CREATE TABLE activities (\n  event_id VARCHAR NOT NULL",
    );
    expect(renderCreateTableSql(getDwhTable("activities"))).toContain(
      "  attributes JSON\n);",
    );
  });

  it("renders the full schema with version metadata", () => {
    const sql = renderSchemaSql();

    expect(sql).toContain("-- dwh_schema_version: 1");
    expect(sql).toContain("CREATE TABLE pull_requests");
    expect(sql).toContain("CREATE TABLE bodies");
    expect(sql.endsWith("\n")).toBe(true);
  });

  it("rejects unknown table lookups", () => {
    expect(() => getDwhTable("missing")).toThrow(/Unknown DWH table/);
  });
});
