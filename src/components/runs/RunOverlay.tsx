"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { repoToSlug } from "@/lib/shared";
import { runTitle } from "./RunWindow";
import { useRuns } from "./RunsProvider";

/** Plain words for a run stuck waiting on a runner. */
export function waitingText(label: string) {
  return `Waiting for a runner — none is online for ${label}`;
}

/**
 * Covers its children with a soft animated layer while a run on one of `stageIds` is going.
 * The layer always has a way out: Stop the run, or Show the page anyway.
 */
export function RunOverlay({ repo, stageIds, children }: { repo: string; stageIds?: string[]; children: ReactNode }) {
  const { runFor, stop } = useRuns();
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const r = runFor(repo);
  const active = !!r && (!stageIds || stageIds.includes(r.stageId)) && hiddenFor !== r.id;
  return (
    <div className="relative">
      <div inert={active} aria-hidden={active || undefined}>{children}</div>
      {active && r && (
        <div className="run-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 overflow-hidden rounded-[28px] bg-white/70 p-4 text-center backdrop-blur-[2px]">
          <span className="run-sweep" aria-hidden="true" />
          <span className={`relative rounded-full px-4 py-1.5 text-sm font-extrabold ${r.waitingForRunner ? "bg-amber-soft text-ink" : "bg-blue-soft text-[#1f4f94]"}`}>
            {r.waitingForRunner ? "Not started yet" : "Busy · one run at a time"}
          </span>
          <p className="relative text-xl font-extrabold" aria-live="polite">
            {r.waitingForRunner ? waitingText(r.waitingForRunner) : <>{runTitle(r)} <span className="text-blue">{r.steps[r.step]}</span></>}
          </p>
          {err && <p role="alert" className="relative font-bold text-red">{err}</p>}
          <div className="relative flex flex-wrap justify-center gap-2">
            <Link href={`/p/${repoToSlug(repo)}/updating?stage=${r.stageId}`} className="flex min-h-[52px] items-center rounded-2xl bg-blue px-6 font-extrabold text-white">View progress</Link>
            <button
              type="button"
              disabled={stopping}
              onClick={async () => {
                setStopping(true);
                const e = await stop(r.id).catch(() => "Could not reach the dashboard; try again");
                setStopping(false);
                setErr(e);
              }}
              className="min-h-[52px] rounded-2xl bg-chip px-6 font-extrabold"
            >
              {stopping ? "Stopping…" : "Stop"}
            </button>
            <button type="button" onClick={() => setHiddenFor(r.id)} className="min-h-[52px] rounded-2xl px-5 font-bold text-soft underline">Show the page anyway</button>
          </div>
        </div>
      )}
    </div>
  );
}
