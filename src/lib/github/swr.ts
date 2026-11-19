// Stale-while-revalidate for page reads. A page render gets the last answer at
// once and, when it is older than `fresh` ms, a background refresh starts. Only
// the very first read of a key waits for GitHub. Never used for permission
// checks: performAction and friends read fresh data.

interface Slot<T> { value?: T; at: number; pending?: Promise<T>; load?: () => Promise<T> }

const g = globalThis as unknown as { __sdSwr?: Map<string, Slot<unknown>> };
const slots: Map<string, Slot<unknown>> = (g.__sdSwr ??= loadFromDisk());

// ---- Saved copy on disk -------------------------------------------------------
// Pages are drawn from this cache; GitHub only updates the cache. It is written to
// .stagedirector-cache/cache.json (git-ignored) so a restarted server, or one that
// has hit GitHub's rate limit, still shows the last known state at once.
// STAGEDIRECTOR_CACHE_FILE overrides the path; set it to "off" to keep memory only.
function cacheFile(): string | null {
  const f = process.env.STAGEDIRECTOR_CACHE_FILE;
  if (f === "off") return null;
  if (f) return f;
  return process.env.VITEST ? null : `${process.cwd()}/.stagedirector-cache/cache.json`;
}

function loadFromDisk(): Map<string, Slot<unknown>> {
  const map = new Map<string, Slot<unknown>>();
  const file = cacheFile();
  if (!file) return map;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    const saved = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, { value: unknown; at: number }>;
    for (const [k, v] of Object.entries(saved)) map.set(k, { value: v.value, at: v.at });
  } catch {
    /* no saved copy yet */
  }
  return map;
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
function saveSoon() {
  const file = cacheFile();
  if (!file || writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("node:fs") as typeof import("node:fs");
      const out: Record<string, { value: unknown; at: number }> = {};
      for (const [k, s] of slots) if (s.at > 0) out[k] = { value: s.value, at: s.at };
      fs.mkdirSync(file.replace(/\/[^/]*$/, ""), { recursive: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(out));
      fs.renameSync(`${file}.tmp`, file);
    } catch {
      /* disk trouble: memory cache still works */
    }
  }, 1000);
}

/**
 * `waitMs`: when stale, wait this long for the refresh before falling back to the
 * old value (used for full page loads, where a person pressed reload and expects news).
 */
import { rateLimited } from "./client";

export async function swr<T>(key: string, fresh: number, load: () => Promise<T>, waitMs = 0): Promise<T> {
  const slot = (slots.get(key) as Slot<T> | undefined) ?? { at: 0 };
  slots.set(key, slot);
  slot.load = load;
  const refresh = () =>
    (slot.pending ??= load()
      .then((v) => {
        slot.value = v;
        slot.at = Date.now();
        saveSoon();
        return v;
      })
      .finally(() => {
        slot.pending = undefined;
      }));
  if (slot.at === 0) return refresh();
  if (waitMs <= 0 && Date.now() - slot.at <= fresh) return slot.value as T;
  if (rateLimited()) return slot.value as T; // GitHub budget nearly gone: keep the last answer until it resets
  if (waitMs <= 0) {
    refresh().catch(() => {}); // keep serving the old value if GitHub fails
    return slot.value as T;
  }
  // A reload: don't reuse a read already in flight (it may have started before the change); start one now.
  const startedAt = Date.now();
  const next = load()
    .then((v) => {
      if (startedAt >= slot.at) {
        Object.assign(slot, { value: v, at: Date.now() });
        saveSoon();
      }
      return v;
    })
    .catch(() => slot.value as T);
  return Promise.race([next, new Promise<T>((r) => setTimeout(() => r(slot.value as T), waitMs))]);
}

/** Drop cached reads whose key contains `part` (e.g. a repo after a button press), so the next read is fresh. */
export function invalidate(part: string) {
  for (const k of slots.keys()) if (k.includes(part)) slots.delete(k);
}

/**
 * Re-read every cached key from GitHub now and wait for it (the timed poll and the
 * Refresh button). Pages keep being served from the old values meanwhile, so
 * clicks stay instant. Skipped while the GitHub rate limit is nearly used up.
 */
export async function revalidateAll(timeoutMs = 15_000): Promise<void> {
  if (rateLimited()) return;
  const work = [...slots.values()].map(async (slot) => {
    if (!slot.load) return;
    try {
      const v = await slot.load();
      Object.assign(slot, { value: v, at: Date.now() });
      saveSoon();
    } catch {
      /* keep the old value */
    }
  });
  await Promise.race([Promise.all(work), new Promise((r) => setTimeout(r, timeoutMs))]);
}
