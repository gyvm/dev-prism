import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchAllTableBuffers, fetchTableBuffer } from "./duckdb-runner.js";
import { dwhTables, exploreDwhTables } from "../warehouse/schema.js";

const actors = dwhTables.find((t) => t.name === "actors")!;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTableBuffer", () => {
  it("returns the parquet bytes on 200", async () => {
    const payload = new Uint8Array([1, 2, 3]).buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toBe("/base/data/actors.parquet");
        return new Response(payload, { status: 200 });
      }),
    );
    const result = await fetchTableBuffer("/base/data", actors);
    expect(result.kind).toBe("buffer");
    if (result.kind !== "buffer") throw new Error("unreachable");
    expect(result.fileName).toBe("actors.parquet");
    expect([...result.bytes]).toEqual([1, 2, 3]);
  });

  it("treats 404 as a legitimately missing table", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    const result = await fetchTableBuffer("/base/data", actors);
    expect(result).toEqual({ table: actors, kind: "missing" });
  });

  it("throws on any other HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500, statusText: "Internal Server Error" })),
    );
    await expect(fetchTableBuffer("/base/data", actors)).rejects.toThrow(
      "Failed to load actors.parquet: HTTP 500 Internal Server Error",
    );
  });
});

describe("fetchAllTableBuffers", () => {
  it("issues every fetch before any response resolves (concurrent, not serial)", async () => {
    const pending: Array<() => void> = [];
    const fetchMock = vi.fn(
      (url: string) =>
        new Promise<Response>((resolve) => {
          pending.push(() => resolve(new Response(new ArrayBuffer(0), { status: 200 })));
          void url;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultsPromise = fetchAllTableBuffers("/base/data");
    // With the old sequential loop only the first fetch would be in flight here.
    expect(fetchMock).toHaveBeenCalledTimes(exploreDwhTables.length);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
      exploreDwhTables.map((table) => `/base/data/${table.name}.parquet`),
    );
    expect(fetchMock).not.toHaveBeenCalledWith("/base/data/bodies.parquet");

    for (const release of pending) release();
    const results = await resultsPromise;
    expect(results.map((r) => r.table.name)).toEqual(exploreDwhTables.map((t) => t.name));
  });
});
