"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { repoToSlug } from "@/lib/shared";
import { runTitle } from "./RunWindow";
import { useRuns } from "./RunsProvider";

/** Covers its children with a soft animated layer while a run on one of `stageIds` is going. */
export function RunOverlay({ repo, stageIds, children }: { repo: string; stageIds?: string[]; children: ReactNode }) {
  const { runFor } = useRuns();
  const r = runFor(repo);
  const active = !!r && (!stageIds || stageIds.includes(r.stageId));
  return (
    <div className="relative">
      <div inert={active} aria-hidden={active || undefined}>{children}</div>
      {active && r && (
        <div className="run-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 overflow-hidden rounded-[28px] bg-white/70 p-4 text-center backdrop-blur-[2px]">
          <span className="run-sweep" aria-hidden="true" />
          <span className="relative rounded-full bg-blue-soft px-4 py-1.5 text-sm font-extrabold text-[#1f4f94]">Busy · one run at a time</span>
          <p className="relative text-xl font-extrabold" aria-live="polite">
            {runTitle(r)} <span className="text-blue">{r.steps[r.step]}</span>
          </p>
          <Link href={`/p/${repoToSlug(repo)}/updating?stage=${r.stageId}`} className="relative flex min-h-[52px] items-center rounded-2xl bg-blue px-6 font-extrabold text-white">View progress</Link>
        </div>
      )}
    </div>
  );
}
