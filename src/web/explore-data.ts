import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { exploreDwhTables } from "../warehouse/schema.js";

export type CopyExploreDataOptions = Readonly<{
  dwhDir?: string;
  outDir?: string;
}>;

// Copies only the tables required by Explore into the static site's public
// assets. The complete DWH (including bodies.parquet for AI/batch work) stays
// in dwhDir and is never copied merely because the dashboard is built.
export async function copyExploreData(
  options: CopyExploreDataOptions = {},
): Promise<readonly string[]> {
  const src = resolve(options.dwhDir ?? "data/dwh");
  const dest = resolve(options.outDir ?? "src/web/public/data");
  const entries = new Set(await readdir(src));
  const files = exploreDwhTables.map((table) => `${table.name}.parquet`);
  const missing = files.filter((name) => !entries.has(name));

  if (missing.length > 0) {
    throw new Error(`DWH is missing Explore parquet file(s): ${missing.join(", ")}`);
  }

  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  await Promise.all(files.map((name) => cp(join(src, name), join(dest, name))));
  return files;
}
