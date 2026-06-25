export const DWH_SCHEMA_VERSION = 1;

export type DwhColumnType =
  | "VARCHAR"
  | "TIMESTAMP"
  | "INTEGER"
  | "BIGINT"
  | "DOUBLE"
  | "BOOLEAN"
  | "JSON";

export type DwhColumnDefinition = Readonly<{
  name: string;
  type: DwhColumnType;
  nullable: boolean;
}>;

export type DwhTableKind = "fact" | "dimension" | "text";

export type DwhTableDefinition = Readonly<{
  name: string;
  kind: DwhTableKind;
  logicalPrimaryKey: readonly string[];
  columns: readonly DwhColumnDefinition[];
}>;

function column(
  name: string,
  type: DwhColumnType,
  options: { nullable?: boolean } = {},
): DwhColumnDefinition {
  return {
    name,
    type,
    nullable: options.nullable ?? false,
  };
}

export const dwhTables = [
  {
    name: "activities",
    kind: "fact",
    logicalPrimaryKey: ["event_id"],
    columns: [
      column("event_id", "VARCHAR"),
      column("source_node_id", "VARCHAR", { nullable: true }),
      column("event_type", "VARCHAR"),
      column("occurred_at", "TIMESTAMP"),
      column("repo_id", "VARCHAR"),
      column("pr_id", "VARCHAR"),
      column("actor_id", "VARCHAR", { nullable: true }),
      column("target_actor_id", "VARCHAR", { nullable: true }),
      column("target_actor_type", "VARCHAR", { nullable: true }),
      column("review_state", "VARCHAR", { nullable: true }),
      column("path", "VARCHAR", { nullable: true }),
      column("line", "INTEGER", { nullable: true }),
      column("value_num", "DOUBLE", { nullable: true }),
      column("attributes", "JSON", { nullable: true }),
    ],
  },
  {
    name: "activity_actors",
    kind: "fact",
    logicalPrimaryKey: ["event_id", "role", "actor_id"],
    columns: [
      column("event_id", "VARCHAR"),
      column("actor_id", "VARCHAR", { nullable: true }),
      column("role", "VARCHAR"),
      column("actor_type", "VARCHAR", { nullable: true }),
    ],
  },
  {
    name: "pull_requests",
    kind: "fact",
    logicalPrimaryKey: ["pr_id"],
    columns: [
      column("pr_id", "VARCHAR"),
      column("pr_key", "VARCHAR"),
      column("source_node_id", "VARCHAR"),
      column("repo_id", "VARCHAR"),
      column("number", "INTEGER"),
      column("title", "VARCHAR", { nullable: true }),
      column("url", "VARCHAR", { nullable: true }),
      column("author_actor_id", "VARCHAR", { nullable: true }),
      column("merged_by_actor_id", "VARCHAR", { nullable: true }),
      column("is_bot_author", "BOOLEAN"),
      column("state", "VARCHAR", { nullable: true }),
      column("is_draft", "BOOLEAN", { nullable: true }),
      column("created_at", "TIMESTAMP"),
      column("updated_at", "TIMESTAMP"),
      column("ready_for_review_at", "TIMESTAMP", { nullable: true }),
      column("first_review_at", "TIMESTAMP", { nullable: true }),
      column("first_approve_at", "TIMESTAMP", { nullable: true }),
      column("merged_at", "TIMESTAMP", { nullable: true }),
      column("closed_at", "TIMESTAMP", { nullable: true }),
      column("additions", "BIGINT", { nullable: true }),
      column("deletions", "BIGINT", { nullable: true }),
      column("changed_files", "INTEGER", { nullable: true }),
    ],
  },
  {
    name: "pr_reviews",
    kind: "fact",
    logicalPrimaryKey: ["review_id"],
    columns: [
      column("review_id", "VARCHAR"),
      column("source_node_id", "VARCHAR"),
      column("pr_id", "VARCHAR"),
      column("author_actor_id", "VARCHAR", { nullable: true }),
      column("state", "VARCHAR"),
      column("submitted_at", "TIMESTAMP", { nullable: true }),
      column("updated_at", "TIMESTAMP"),
      column("commit_oid", "VARCHAR", { nullable: true }),
      column("url", "VARCHAR", { nullable: true }),
    ],
  },
  {
    name: "pr_review_requests",
    kind: "fact",
    logicalPrimaryKey: ["request_id"],
    columns: [
      column("request_id", "VARCHAR"),
      column("source_node_id", "VARCHAR", { nullable: true }),
      column("pr_id", "VARCHAR"),
      column("requested_actor_id", "VARCHAR", { nullable: true }),
      column("requested_actor_type", "VARCHAR"),
      column("as_code_owner", "BOOLEAN", { nullable: true }),
      column("requested_reviewer_key", "VARCHAR", { nullable: true }),
    ],
  },
  {
    name: "pr_review_threads",
    kind: "fact",
    logicalPrimaryKey: ["thread_id"],
    columns: [
      column("thread_id", "VARCHAR"),
      column("source_node_id", "VARCHAR"),
      column("pr_id", "VARCHAR"),
      column("path", "VARCHAR"),
      column("line", "INTEGER", { nullable: true }),
      column("start_line", "INTEGER", { nullable: true }),
      column("subject_type", "VARCHAR", { nullable: true }),
      column("is_resolved", "BOOLEAN", { nullable: true }),
      column("is_outdated", "BOOLEAN", { nullable: true }),
      column("resolved_by_actor_id", "VARCHAR", { nullable: true }),
    ],
  },
  {
    name: "pr_review_comments",
    kind: "fact",
    logicalPrimaryKey: ["comment_id"],
    columns: [
      column("comment_id", "VARCHAR"),
      column("source_node_id", "VARCHAR"),
      column("pr_id", "VARCHAR"),
      column("thread_id", "VARCHAR", { nullable: true }),
      column("review_id", "VARCHAR", { nullable: true }),
      column("author_actor_id", "VARCHAR", { nullable: true }),
      column("created_at", "TIMESTAMP"),
      column("updated_at", "TIMESTAMP"),
      column("path", "VARCHAR"),
      column("line", "INTEGER", { nullable: true }),
      column("start_line", "INTEGER", { nullable: true }),
      column("original_line", "INTEGER", { nullable: true }),
      column("state", "VARCHAR", { nullable: true }),
      column("is_outdated", "BOOLEAN", { nullable: true }),
      column("url", "VARCHAR", { nullable: true }),
    ],
  },
  {
    name: "pr_commits",
    kind: "fact",
    logicalPrimaryKey: ["pr_id", "oid"],
    columns: [
      column("pr_id", "VARCHAR"),
      column("oid", "VARCHAR"),
      column("committed_at", "TIMESTAMP"),
      column("authored_at", "TIMESTAMP", { nullable: true }),
      column("author_actor_id", "VARCHAR", { nullable: true }),
      column("author_name", "VARCHAR", { nullable: true }),
      column("author_email", "VARCHAR", { nullable: true }),
      column("message_headline_len", "INTEGER", { nullable: true }),
    ],
  },
  {
    name: "pr_files",
    kind: "fact",
    logicalPrimaryKey: ["pr_id", "path"],
    columns: [
      column("pr_id", "VARCHAR"),
      column("path", "VARCHAR"),
      column("additions", "BIGINT", { nullable: true }),
      column("deletions", "BIGINT", { nullable: true }),
      column("change_type", "VARCHAR", { nullable: true }),
    ],
  },
  {
    name: "pr_labels",
    kind: "fact",
    logicalPrimaryKey: ["pr_id", "label"],
    columns: [
      column("pr_id", "VARCHAR"),
      column("label", "VARCHAR"),
    ],
  },
  {
    name: "actors",
    kind: "dimension",
    logicalPrimaryKey: ["actor_id"],
    columns: [
      column("actor_id", "VARCHAR"),
      column("actor_type", "VARCHAR"),
      column("login", "VARCHAR", { nullable: true }),
      column("slug", "VARCHAR", { nullable: true }),
      column("display_name", "VARCHAR", { nullable: true }),
      column("url", "VARCHAR", { nullable: true }),
      column("is_bot", "BOOLEAN"),
      column("team", "VARCHAR", { nullable: true }),
    ],
  },
  {
    name: "repos",
    kind: "dimension",
    logicalPrimaryKey: ["repo_id"],
    columns: [
      column("repo_id", "VARCHAR"),
      column("repo_key", "VARCHAR"),
      column("owner", "VARCHAR"),
      column("name", "VARCHAR"),
      column("visibility", "VARCHAR", { nullable: true }),
    ],
  },
  {
    name: "bodies",
    kind: "text",
    logicalPrimaryKey: ["subject_id", "subject_kind"],
    columns: [
      column("subject_id", "VARCHAR"),
      column("subject_kind", "VARCHAR"),
      column("source_node_id", "VARCHAR", { nullable: true }),
      column("text", "VARCHAR", { nullable: true }),
      column("text_len", "INTEGER", { nullable: true }),
      column("body_hash", "VARCHAR", { nullable: true }),
      column("updated_at", "TIMESTAMP", { nullable: true }),
    ],
  },
] as const satisfies readonly DwhTableDefinition[];

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

function assertIdentifier(identifier: string): void {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Invalid DWH identifier: ${identifier}`);
  }
}

export function getDwhTable(tableName: string): DwhTableDefinition {
  const table = dwhTables.find((candidate) => candidate.name === tableName);
  if (!table) {
    throw new Error(`Unknown DWH table: ${tableName}`);
  }
  return table;
}

export function renderCreateTableSql(table: DwhTableDefinition): string {
  assertIdentifier(table.name);
  for (const columnDefinition of table.columns) {
    assertIdentifier(columnDefinition.name);
  }

  const columns = table.columns
    .map((columnDefinition) => {
      const notNull = columnDefinition.nullable ? "" : " NOT NULL";
      return `  ${columnDefinition.name} ${columnDefinition.type}${notNull}`;
    })
    .join(",\n");

  return `CREATE TABLE ${table.name} (\n${columns}\n);`;
}

export function renderSchemaSql(): string {
  const header = [
    "-- Generated from src/warehouse/schema.ts.",
    `-- dwh_schema_version: ${DWH_SCHEMA_VERSION}`,
  ].join("\n");
  const tables = dwhTables.map((table) => renderCreateTableSql(table)).join("\n\n");
  return `${header}\n\n${tables}\n`;
}

export const dwhSchemaSql = renderSchemaSql();
