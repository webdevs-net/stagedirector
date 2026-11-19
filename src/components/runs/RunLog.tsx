"use client";

import { useEffect, useState } from "react";
import { runLogAction } from "@/app/actions";
import { Chevron } from "../ui";
import { useRuns } from "./RunsProvider";

/** The technical log of the newest run on a stage. Refreshes every few seconds while it is open and a run is going. */
export function RunLog({ repo, repoSlug, stageId, initial }: { repo: string; repoSlug: string; stageId: string; initial: { lines: string[]; url: string | null; sample: boolean } }) {
  const { runFor } = useRuns();
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState(initial);
  const running = !!runFor(repo);

  useEffect(() => {
    if (!open || log.sample) return;
    let alive = true;
    const load = () => runLogAction(repoSlug, stageId).then((l) => alive && setLog(l)).catch(() => {});
    load();
    if (!running) return () => { alive = false; };
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [open, running, repoSlug, stageId, log.sample]);

  return (
    <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="rounded-3xl bg-white shadow-[0_6px_24px_rgba(30,43,58,.06)]">
      <summary className="flex min-h-16 items-center justify-between px-6 text-lg font-extrabold"><span>Show the technical log</span><Chevron /></summary>
      {log.url && (
        <a href={log.url} target="_blank" rel="noreferrer" className="mx-6 mb-2 inline-block font-bold text-blue underline">Open this run on GitHub</a>
      )}
      <pre className="mx-4 mb-4 max-h-[480px] overflow-auto rounded-2xl bg-ink p-4 font-mono text-[13px] leading-relaxed text-[#e3e4ea]">{log.lines.join("\n")}</pre>
    </details>
  );
}
