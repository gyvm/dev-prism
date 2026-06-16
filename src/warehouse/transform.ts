import type { BotLoginMatcher } from "../shared/bot.js";
import type { NormalizedPullRequest } from "../shared/types.js";
import { buildBodyRows } from "./bodies.js";
import { buildEntityRows } from "./entities.js";
import { buildActivityRows } from "./events.js";
import { dwhTables } from "./schema.js";
import type { DwhTableRows } from "./rows.js";

export function buildWarehouseRows(
  pullRequests: readonly NormalizedPullRequest[],
  isBotLogin: BotLoginMatcher,
): DwhTableRows {
  const entities = buildEntityRows(pullRequests, isBotLogin);
  const activities = buildActivityRows(pullRequests);
  const bodies = buildBodyRows(pullRequests);
  const rows: Record<string, readonly import("./rows.js").DwhRow[]> = {};

  for (const table of dwhTables) {
    rows[table.name] = [];
  }

  return {
    ...rows,
    ...activities,
    ...entities,
    bodies,
  };
}
