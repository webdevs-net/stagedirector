"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

/** Fire after any button press that changes state, so every page re-reads GitHub at once. */
export const CHANGED_EVENT = "stagedirector:changed";
export function announceChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED_EVENT));
}

const EVERY_MS = 15_000;

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/**
 * Keeps server-rendered pages current: re-renders from GitHub every 15s while the
 * tab is visible, when the window regains focus, and right after an action.
 * router.refresh() is a soft refresh: no page reload. React re-renders the server
 * components and patches only the DOM that changed, so scroll position, open
 * <details>, and client state (forms, run window) stay as they are.
 * Background polls are silent; only a pressed Refresh shows "Checking GitHub…".
 * GitHub answers unchanged polls with 304 (see src/lib/github/etag.ts), so this is cheap.
 */
export function LiveRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const wasPending = useRef(false);
  const [manual, setManual] = useState(false);

  const refresh = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    setUpdatedAt(Date.now());
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setUpdatedAt(Date.now());
      setManual(false);
    }
    wasPending.current = pending;
  }, [pending]);

  useEffect(() => {
    const poll = setInterval(refresh, EVERY_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return (
    <div className="fixed right-3 top-3 z-40 flex items-center gap-2 rounded-full bg-white/90 py-1 pl-3.5 pr-1 text-sm font-bold text-muted shadow-[0_4px_18px_rgba(30,43,58,.08)]" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${pending && manual ? "animate-pulse bg-blue" : "bg-teal"}`} aria-hidden="true" />
      <span data-testid="updated-ago">{pending && manual ? "Checking GitHub…" : updatedAt ? `Updated ${ago(now - updatedAt)}` : "Live"}</span>
      <button type="button" onClick={() => { setManual(true); refresh(); }} className="min-h-9 rounded-full px-3 text-blue hover:bg-blue-soft">Refresh</button>
    </div>
  );
}
