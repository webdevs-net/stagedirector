import { describe, expect, it } from "vitest";
import { EtagCache } from "./etag";

const ok = (data: unknown, etag = '"v1"') => ({ status: 200, url: "u", headers: { etag }, data });

describe("EtagCache", () => {
  it("sends If-None-Match and returns the cached body on 304", async () => {
    const cache = new EtagCache();
    const seen: (string | undefined)[] = [];
    let calls = 0;
    const request = async (o: { headers?: Record<string, string | undefined> }) => {
      seen.push(o.headers?.["if-none-match"]);
      if (calls++ === 0) return ok({ n: 1 });
      throw Object.assign(new Error("Not modified"), { status: 304 });
    };
    expect((await cache.wrap(request, { method: "GET" }, "k")).data).toEqual({ n: 1 });
    expect((await cache.wrap(request, { method: "GET" }, "k")).data).toEqual({ n: 1 });
    expect(seen).toEqual([undefined, '"v1"']);
    expect(cache.hits).toBe(1);
  });

  it("replaces the entry when GitHub sends a new body", async () => {
    const cache = new EtagCache();
    let n = 0;
    const request = async () => ok({ n: ++n }, `"v${n}"`);
    await cache.wrap(request, {}, "k");
    expect((await cache.wrap(request, {}, "k")).data).toEqual({ n: 2 });
  });

  it("never caches or conditions writes", async () => {
    const cache = new EtagCache();
    const seen: unknown[] = [];
    const request = async (o: { headers?: Record<string, string | undefined> }) => (seen.push(o.headers), ok({}));
    await cache.wrap(request, { method: "POST" }, "k");
    await cache.wrap(request, { method: "POST" }, "k");
    expect(cache.size).toBe(0);
    expect(seen).toEqual([undefined, undefined]);
  });

  it("rethrows real errors and 304s with no cached entry", async () => {
    const cache = new EtagCache();
    const request = async () => { throw Object.assign(new Error("x"), { status: 304 }); };
    await expect(cache.wrap(request, {}, "k")).rejects.toThrow("x");
  });

  it("drops the oldest entry past the limit", async () => {
    const cache = new EtagCache(2);
    const request = async () => ok({});
    for (const k of ["a", "b", "c"]) await cache.wrap(request, {}, k);
    expect(cache.size).toBe(2);
  });
});
