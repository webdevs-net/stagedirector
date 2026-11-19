import { describe, expect, it } from "vitest";
import { invalidate, swr } from "./swr";

describe("swr", () => {
  it("waits only the first time, then serves the old value while refreshing", async () => {
    let n = 0;
    const load = async () => ++n;
    expect(await swr("t1", -1, load)).toBe(1);
    expect(await swr("t1", -1, load)).toBe(1); // stale: old value now, refresh behind
    await new Promise((r) => setTimeout(r, 0));
    expect(await swr("t1", 60_000, load)).toBe(2);
  });

  it("keeps the old value when a refresh fails", async () => {
    let fail = false;
    const load = async () => { if (fail) throw new Error("down"); return "ok"; };
    await swr("t2", -1, load);
    fail = true;
    expect(await swr("t2", -1, load)).toBe("ok");
  });

  it("invalidate forces a fresh read", async () => {
    let n = 0;
    await swr("repo:a/b", 60_000, async () => ++n);
    invalidate("a/b");
    expect(await swr("repo:a/b", 60_000, async () => ++n)).toBe(2);
  });
});

describe("swr waitMs", () => {
  it("returns the refreshed value when it arrives in time", async () => {
    let n = 0;
    await swr("w1", -1, async () => ++n);
    expect(await swr("w1", -1, async () => ++n, 500)).toBe(2);
  });
  it("falls back to the old value when the refresh is slow", async () => {
    await swr("w2", -1, async () => "old");
    const slow = () => new Promise<string>((r) => setTimeout(() => r("new"), 200));
    expect(await swr("w2", -1, slow, 20)).toBe("old");
  });
});
