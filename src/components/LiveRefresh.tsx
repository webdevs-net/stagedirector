"use client";

import { useRouter } from "next/navigation";
import { refreshNowAction } from "@/app/actions";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

/** Fire after any button press that changes state, so every page re-reads GitHub at once. */
export const CHANGED_EVENT = "stagedirector:changed";
export function announceChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED_EVENT));
}


function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/**
 * Keeps server-rendered pages current: re-renders from GitHub every `everyMs` (default 5 min) while the
 * tab is visible, when the window regains focus, and right after an action.
 * router.refresh() is a soft refresh: no page reload. React re-renders the server
 * components and patches only the DOM that changed, so scroll position, open
 * <details>, and client state (forms, run window) stay as they are.
 * Background polls are silent; only a pressed Refresh shows "Checking GitHub…".
 * GitHub answers unchanged polls with 304 (see src/lib/github/etag.ts), so this is cheap.
 */
export function LiveRefresh({ demo = false, limitedUntil = null, everyMs = 60_000 }: { demo?: boolean; limitedUntil?: number | null; everyMs?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const wasPending = useRef(false);
  const [manual, setManual] = useState(false);

  // After an action: the server already cleared that project's cache, so a re-render is enough.
  const refresh = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    startTransition(() => router.refresh());
  }, [router]);

  // Timed poll and the Refresh button: read GitHub first, then re-render from the fresh data.
  const refreshFromGithub = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    startTransition(async () => {
      await refreshNowAction().catch(() => {});
      router.refresh();
    });
  }, [router]);

  const last = useRef(0);
  useEffect(() => {
    if (updatedAt) last.current = updatedAt;
  }, [updatedAt]);
  // Coming back to the tab: catch up only if the last read is older than one poll.
  const onReturn = useCallback(() => {
    if (Date.now() - last.current >= everyMs) refreshFromGithub();
  }, [everyMs, refreshFromGithub]);

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
    const poll = setInterval(refreshFromGithub, everyMs); // skips hidden tabs
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    const onVisible = () => document.visibilityState === "visible" && onReturn();
    window.addEventListener("focus", onReturn);
    window.addEventListener(CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("focus", onReturn);
      window.removeEventListener(CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, refreshFromGithub, onReturn, everyMs]);

  return (
    <div className="fixed right-3 top-3 z-40 flex items-center gap-2 rounded-full bg-white/90 py-1 pl-3.5 pr-1 text-sm font-bold text-muted shadow-[0_4px_18px_rgba(30,43,58,.08)]" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${pending && manual ? "animate-pulse bg-blue" : "bg-teal"}`} aria-hidden="true" />
      {limitedUntil && (
        <span className="rounded-full bg-amber-soft px-2.5 py-0.5 text-amber" title="GitHub allows a set number of requests per hour. Showing the last data read until the limit resets.">
          GitHub limit reached · last known data until {new Date(limitedUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </span>
      )}
      {demo && <span className="rounded-full bg-amber-soft px-2.5 py-0.5 text-amber" title="No GitHub credentials set: showing built-in demo data">Demo data</span>}
      <span data-testid="updated-ago">{pending && manual ? "Checking GitHub…" : updatedAt ? `Updated ${ago(now - updatedAt)}` : "Live"}</span>
      <button type="button" onClick={() => { setManual(true); refreshFromGithub(); }} className="min-h-9 rounded-full px-3 text-blue hover:bg-blue-soft">Refresh</button>
    </div>
  );
}
