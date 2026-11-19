import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("swr saved copy on disk", () => {
  it("a restarted server serves the saved value without asking GitHub", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "sd-cache-")), "cache.json");
    process.env.STAGEDIRECTOR_CACHE_FILE = file;
    const g = globalThis as { __sdSwr?: unknown };
    delete g.__sdSwr;
    vi.resetModules();
    const first = await import("./swr");
    expect(await first.swr("p", 60_000, async () => ({ name: "Maria's Place" }))).toEqual({ name: "Maria's Place" });
    await new Promise((r) => setTimeout(r, 1200)); // write is debounced 1 s
    expect(existsSync(file)).toBe(true);

    // "Restart": new module, empty memory. GitHub is down; the saved copy still answers.
    delete g.__sdSwr;
    vi.resetModules();
    const second = await import("./swr");
    const down = async () => { throw new Error("rate limited"); };
    expect(await second.swr("p", 60_000, down)).toEqual({ name: "Maria's Place" });
    delete process.env.STAGEDIRECTOR_CACHE_FILE;
  });
});
