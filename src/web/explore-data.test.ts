import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { copyExploreData } from "./explore-data.js";
import { dwhTables, exploreDwhTables } from "../warehouse/schema.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createDwh(): Promise<{ dwhDir: string; publicDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "gh-insights-explore-data-"));
  temporaryDirectories.push(root);
  const dwhDir = join(root, "dwh");
  const publicDir = join(root, "public", "data");
  await mkdir(dwhDir, { recursive: true });
  await Promise.all(
    dwhTables.map((table) => writeFile(join(dwhDir, `${table.name}.parquet`), table.name, "utf8")),
  );
  return { dwhDir, publicDir };
}

describe("copyExploreData", () => {
  it("copies only the current Explore dataset and preserves complete DWH text data", async () => {
    const { dwhDir, publicDir } = await createDwh();

    const copied = await copyExploreData({ dwhDir, outDir: publicDir });

    const expected = exploreDwhTables.map((table) => `${table.name}.parquet`).sort();
    expect([...copied].sort()).toEqual(expected);
    expect((await readdir(publicDir)).sort()).toEqual(expected);
    await expect(readFile(join(dwhDir, "bodies.parquet"), "utf8")).resolves.toBe("bodies");
  });

  it("fails before replacing the public dataset when a required Explore table is missing", async () => {
    const { dwhDir, publicDir } = await createDwh();
    await mkdir(publicDir, { recursive: true });
    await writeFile(join(publicDir, "previous.parquet"), "previous", "utf8");
    await rm(join(dwhDir, "actors.parquet"));

    await expect(copyExploreData({ dwhDir, outDir: publicDir })).rejects.toThrow(
      "DWH is missing Explore parquet file(s): actors.parquet",
    );
    expect(await readdir(publicDir)).toEqual(["previous.parquet"]);
  });
});
