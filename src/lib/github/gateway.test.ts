import { describe, expect, it } from "vitest";
import { Gateway, GatewayBusy, asCaller } from "./gateway";

const ok = (headers: Record<string, string> = {}) => ({ status: 200, url: "u", headers: { etag: '"e"', ...headers }, data: {} });

function clock() {
  let t = 1_000_000;
  return { now: () => t, add: (ms: number) => (t += ms) };
}

describe("Gateway", () => {
  it("caps background calls and refills over time", async () => {
    const c = clock();
    const gw = new Gateway({ perMinute: 5, burst: 2, now: c.now });
    const req = async () => ok();
    await gw.handle(req, {}, "GET /a", "a1", "poll");
    await gw.handle(req, {}, "GET /a", "a2", "poll");
    await expect(gw.handle(req, {}, "GET /a", "a3", "poll")).rejects.toBeInstanceOf(GatewayBusy);
    c.add(12_000); // 5/min = one per 12 s
    await gw.handle(req, {}, "GET /a", "a4", "poll");
    expect(gw.summary().rows[0]).toMatchObject({ route: "GET /a", ok: 3, held: 1 });
  });

  it("never holds back button presses", async () => {
    const gw = new Gateway({ perMinute: 5, burst: 0 });
    await expect(gw.handle(async () => ok(), { method: "POST" }, "POST /dispatch", "d", "action")).resolves.toBeTruthy();
  });

  it("tags calls by caller through asCaller", async () => {
    const gw = new Gateway({ perMinute: 5, burst: 5 });
    await asCaller("action", () => gw.handle(async () => ok(), {}, "GET /x", "x"));
    expect(gw.calls[0].caller).toBe("action");
  });

  it("shares an identical GET that is already in flight", async () => {
    const gw = new Gateway({ perMinute: 5, burst: 5 });
    let n = 0;
    const req = () => new Promise<ReturnType<typeof ok>>((r) => setTimeout(() => (n++, r(ok())), 10));
    await Promise.all([gw.handle(req, {}, "GET /s", "s", "page"), gw.handle(req, {}, "GET /s", "s", "page")]);
    expect(n).toBe(1);
    expect(gw.summary().rows[0]).toMatchObject({ ok: 1, shared: 1 });
  });

  it("stops background calls when GitHub's budget is nearly gone", async () => {
    const gw = new Gateway({ perMinute: 5, burst: 5 });
    const reset = String(Math.floor(Date.now() / 1000) + 600);
    await gw.handle(async () => ok({ "x-ratelimit-remaining": "50", "x-ratelimit-reset": reset }), {}, "GET /r", "r1", "page");
    await expect(gw.handle(async () => ok(), {}, "GET /r", "r2", "poll")).rejects.toBeInstanceOf(GatewayBusy);
    await expect(gw.handle(async () => ok(), {}, "GET /r", "r3", "action")).resolves.toBeTruthy();
    expect(gw.summary().limit.remaining).toBe(50);
  });

  it("counts 304s as free", async () => {
    const gw = new Gateway({ perMinute: 5, burst: 5 });
    await gw.handle(async () => ok(), {}, "GET /e", "e", "page");
    await gw.handle(async () => { throw Object.assign(new Error("nm"), { status: 304 }); }, {}, "GET /e", "e", "page");
    expect(gw.summary()).toMatchObject({ counted: 1 });
    expect(gw.summary().rows[0].notModified).toBe(1);
  });
});

describe("304s are free", () => {
  it("a not-modified answer gives its budget slot back", async () => {
    const gw = new Gateway({ perMinute: 1, burst: 2, now: () => 0 });
    let n = 0;
    // First call: 200 with an ETag; later calls: 304 when If-None-Match is sent on the same options object.
    const req = async (o: { headers?: Record<string, string | undefined> }) => {
      n++;
      if (o.headers?.["if-none-match"] === "e1") throw Object.assign(new Error("not modified"), { status: 304 });
      return { status: 200, url: "u", headers: { etag: "e1" }, data: { n } };
    };
    for (let i = 0; i < 5; i++) await gw.handle(req as never, { headers: {} }, "GET /a", "a", "poll");
    expect(gw.calls.map((c) => c.outcome)).toEqual(["ok", "not-modified", "not-modified", "not-modified", "not-modified"]);
    expect(n).toBe(5);
  });
});
