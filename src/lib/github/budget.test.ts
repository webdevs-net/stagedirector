import { describe, expect, it } from "vitest";
import { Gateway, GatewayBusy, type Caller } from "./gateway";

// One visible tab for one hour, as the app drives it:
//  - timed refresh every 60 s (LiveRefresh), each wanting a full fresh project read.
//    Pessimistic: 25 REST calls per read (no local git copy, no 304s).
//  - a 5-minute deploy at minute 20: run window asks every 5 s (RunsProvider), the server
//    goes to GitHub at most every 15 s (RUN_TTL) for 2 calls (runs + jobs); the technical
//    log is open and asks every 10 s, the server reads it at most every 15 s (2 calls).
//  - 3 button presses (update staging, stop, approve).
// Everything goes through the gateway with the default cap (5 a minute, burst 40).
const BUDGET_PER_HOUR = 5 * 60 + 40; // 340 background calls, whatever the pages ask for

function simulateHour() {
  let t = 0;
  const gw = new Gateway({ perMinute: 5, burst: 40, now: () => t });
  const ok = async () => ({ status: 200, url: "u", headers: {}, data: {} });
  let n = 0;
  const call = async (caller: Caller) => {
    try {
      await gw.handle(ok, {}, `GET /x`, `GET /x/${n++}`, caller);
      return true;
    } catch (e) {
      if (!(e instanceof GatewayBusy)) throw e;
      return false;
    }
  };
  const actionsOk: boolean[] = [];
  return (async () => {
    for (let s = 0; s < 3600; s++) {
      t = s * 1000;
      if (s % 60 === 0) for (let i = 0; i < 25; i++) await call("poll");
      const deploying = s >= 20 * 60 && s < 25 * 60;
      if (deploying && s % 15 === 0) {
        await call("runs");
        await call("runs"); // run + jobs
        await call("runs");
        await call("runs"); // log: jobs + download
      }
      if (s === 20 * 60 || s === 22 * 60 || s === 26 * 60) actionsOk.push(await call("action"));
    }
    return { gw, actionsOk };
  })();
}

describe("GitHub budget for one visible tab", () => {
  it(`stays at or under ${BUDGET_PER_HOUR} background calls an hour, idle plus a 5-minute deploy`, async () => {
    const { gw, actionsOk } = await simulateHour();
    const background = gw.calls.filter((c) => c.caller !== "action" && c.outcome === "ok").length;
    expect(background).toBeLessThanOrEqual(BUDGET_PER_HOUR);
    // Busiest minute: never more than the burst plus one minute's allowance.
    const perMinute = new Map<number, number>();
    for (const c of gw.calls) if (c.outcome === "ok" && c.caller !== "action") perMinute.set(Math.floor(c.at / 60_000), (perMinute.get(Math.floor(c.at / 60_000)) ?? 0) + 1);
    expect(Math.max(...perMinute.values())).toBeLessThanOrEqual(45);
    // After the cold start it settles to about 5 a minute (a minute can borrow a few from the next).
    const later = [...perMinute.entries()].filter(([m]) => m >= 10).map(([, v]) => v);
    expect(later.reduce((a, b) => a + b, 0) / later.length).toBeLessThanOrEqual(5.2);
    expect(Math.max(...later)).toBeLessThanOrEqual(10);
    // Button presses always went through.
    expect(actionsOk).toEqual([true, true, true]);
  });
});

describe("a page someone opened", () => {
  const ok = async () => ({ status: 200, url: "u", headers: {}, data: {} });
  it("waits for a free slot instead of failing; a poll still fails at once", async () => {
    let t = 0;
    const gw = new Gateway({ perMinute: 6, burst: 1, now: () => t, sleep: async (ms) => { t += ms; } });
    await gw.handle(ok, {}, "GET /x", "GET /x/1", "poll"); // uses the only token
    await expect(gw.handle(ok, {}, "GET /x", "GET /x/2", "poll")).rejects.toBeInstanceOf(GatewayBusy);
    const start = t;
    await expect(gw.handle(ok, {}, "GET /x", "GET /x/3", "page")).resolves.toMatchObject({ status: 200 });
    expect(t - start).toBeGreaterThan(0);
    expect(t - start).toBeLessThanOrEqual(11_000); // one token at 6 a minute = 10 s
  });
  it("gives up after pageWaitMs", async () => {
    let t = 0;
    const gw = new Gateway({ perMinute: 1, burst: 1, now: () => t, sleep: async (ms) => { t += ms; }, pageWaitMs: 5_000 });
    await gw.handle(ok, {}, "GET /x", "GET /x/1", "page");
    await expect(gw.handle(ok, {}, "GET /x", "GET /x/2", "page")).rejects.toBeInstanceOf(GatewayBusy);
    expect(t).toBeLessThanOrEqual(5_000);
  });
});
