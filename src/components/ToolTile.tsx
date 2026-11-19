"use client";

import { useState, type ReactNode } from "react";
import type { RunKind } from "@/lib/data";
import { useRuns } from "./runs/RunsProvider";

export function ToolTile({ repo, stageId, kind, title, detail, icon, badge }: { repo: string; stageId: string; kind?: RunKind; title: string; detail: string; icon: ReactNode; badge?: number }) {
  const { start, runFor } = useRuns();
  const busy = !!runFor(repo);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const onClick = async () => {
    if (!kind) return;
    setError(null); setStarting(true);
    try { setError(await start(repo, stageId, kind)); } catch { setError("Could not start it. Try again."); } finally { setStarting(false); }
  };
  return (
    <button type="button" disabled={!!kind && (busy || starting)} onClick={onClick} aria-describedby={error ? `${title}-error` : undefined}
      className="relative flex min-h-[140px] flex-col items-start justify-between gap-3 rounded-3xl bg-white p-5 text-left shadow-[0_4px_16px_rgba(30,43,58,.06)] hover:bg-blue-soft disabled:opacity-60">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-soft text-blue">{icon}</span>
      {badge ? <span className="absolute right-4 top-4 rounded-full bg-blue px-2.5 text-sm font-extrabold text-white" aria-label={`${badge} waiting`}>{badge}</span> : null}
      <span className="flex flex-col">
        <span className="text-lg font-extrabold">{title}</span>
        <span className="text-[15px] text-muted">{starting ? "Starting…" : detail}</span>
        {error ? <span id={`${title}-error`} role="alert" className="mt-1 text-[15px] font-bold text-[#b45309]">{error}</span> : null}
      </span>
    </button>
  );
}
