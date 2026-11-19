// Stale-while-revalidate for page reads. A page render gets the last answer at
// once and, when it is older than `fresh` ms, a background refresh starts. Only
// the very first read of a key waits for GitHub. Never used for permission
// checks: performAction and friends read fresh data.

interface Slot<T> { value?: T; at: number; pending?: Promise<T> }

const g = globalThis as unknown as { __sdSwr?: Map<string, Slot<unknown>> };
const slots: Map<string, Slot<unknown>> = (g.__sdSwr ??= new Map());

/**
 * `waitMs`: when stale, wait this long for the refresh before falling back to the
 * old value (used for full page loads, where a person pressed reload and expects news).
 */
import { rateLimited } from "./client";

export async function swr<T>(key: string, fresh: number, load: () => Promise<T>, waitMs = 0): Promise<T> {
  const slot = (slots.get(key) as Slot<T> | undefined) ?? { at: 0 };
  slots.set(key, slot);
  const refresh = () =>
    (slot.pending ??= load()
      .then((v) => {
        slot.value = v;
        slot.at = Date.now();
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
      if (startedAt >= slot.at) Object.assign(slot, { value: v, at: Date.now() });
      return v;
    })
    .catch(() => slot.value as T);
  return Promise.race([next, new Promise<T>((r) => setTimeout(() => r(slot.value as T), waitMs))]);
}

/** Drop cached reads whose key contains `part` (e.g. a repo after a button press), so the next read is fresh. */
export function invalidate(part: string) {
  for (const k of slots.keys()) if (k.includes(part)) slots.delete(k);
}
