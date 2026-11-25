"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ActiveRun } from "@/lib/data";
import { repoToSlug } from "@/lib/shared";
import { Icon } from "../ui";
import { useRuns } from "./RunsProvider";

const VERB: Record<ActiveRun["kind"], string> = {
  update: "Updating",
  "put-live": "Putting live:",
  undo: "Undoing on",
  "clear-cache": "Clearing cache on",
  snapshot: "Backing up",
  "copy-live": "Copying live data into",
};

function elapsed(r: ActiveRun, now: number) {
  const s = Math.max(0, Math.round(((r.finishedAt ?? now) - r.startedAt) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function runTitle(r: ActiveRun) {
  if (r.state === "passed") {
    if (r.kind === "clear-cache") return "Cache cleared";
    if (r.kind === "snapshot") return "Backup saved";
    if (r.kind === "copy-live") return "Live data copied to staging";
    return `${r.stageName} updated`;
  }
  if (r.state === "failed") return "Something went wrong — undone";
  if (r.state === "stopped") return "Stopped — nothing changed";
  return `${VERB[r.kind]} ${r.stageName.toLowerCase()}…`;
}

export function RunWindow() {
  const { runs, stop } = useRuns();
  const [now, setNow] = useState(() => Date.now());
  const [mini, setMini] = useState<Record<string, boolean>>({});
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const [stopErr, setStopErr] = useState<Record<string, string>>({});

  const [phone, setPhone] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => {
      clearInterval(t);
      mq.removeEventListener("change", update);
    };
  }, []);

  // Auto-collapse finished runs ~10 s after they end.
  const visible = runs.filter((r) => !gone[r.id] && !(r.finishedAt && now - r.finishedAt > 10_000));
  if (visible.length === 0) return null;
  // On phones only the newest run is shown in full; the others start as pills.
  const newest = visible.reduce((a, b) => (b.startedAt > a.startedAt ? b : a)).id;
  const isMini = (id: string) => mini[id] ?? (phone && id !== newest);

  return (
    <aside aria-label="Runs in progress" className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 p-3 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px] sm:p-0">
      {visible.map((r) => {
        const done = r.state !== "running";
        const ok = r.state === "passed";
        const bad = r.state === "failed";
        const tone = !done ? "bg-white" : ok ? "bg-teal-soft" : bad ? "bg-red-soft" : "bg-chip";
        const base = `/p/${repoToSlug(r.repo)}`;
        if (isMini(r.id)) {
          return (
            <button key={r.id} type="button" onClick={() => setMini({ ...mini, [r.id]: false })}
              className={`ml-auto flex min-h-[52px] items-center gap-2.5 rounded-full px-5 font-extrabold shadow-[0_8px_30px_rgba(30,43,58,.18)] ${tone}`}>
              {!done && <span className="run-dot h-2.5 w-2.5 rounded-full bg-blue" aria-hidden="true" />}
              <span>{r.projectName} · {done ? runTitle(r) : `${r.progress}%`}</span>
            </button>
          );
        }
        return (
          <section key={r.id} aria-label={`${r.projectName} run`} className={`flex flex-col gap-3 rounded-t-[24px] p-5 shadow-[0_12px_40px_rgba(30,43,58,.22)] sm:rounded-[24px] ${tone}`}>
            <div className="flex items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${!done ? "bg-blue" : ok ? "bg-teal" : bad ? "bg-[#d64545]" : "bg-muted"}`}>
                <Icon name={ok ? "check" : bad ? "alert" : "refresh"} className={!done ? "run-spin" : ""} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-muted">{r.projectName}</p>
                <h2 className="text-lg font-extrabold leading-tight">{runTitle(r)}</h2>
              </div>
              <button type="button" aria-label="Minimise" onClick={() => setMini({ ...mini, [r.id]: true })} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-black/5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
              </button>
            </div>
            {!done && (
              <>
                {r.waitingForRunner && <p role="status" className="rounded-xl bg-amber-soft px-3 py-2 font-bold">Waiting for a runner — none is online for {r.waitingForRunner}. Stop it, or it starts by itself once the runner is back.</p>}
                <p aria-live="polite" className="font-bold">{r.steps[r.step]} <span className="font-normal text-muted">· {elapsed(r, now)}</span></p>
                <div role="progressbar" aria-label="Progress" aria-valuenow={r.progress} aria-valuemin={0} aria-valuemax={100} className="h-3 overflow-hidden rounded-full bg-[#e3e9f0]">
                  <div className="h-full rounded-full bg-blue transition-[width] duration-700" style={{ width: `${r.progress}%` }} />
                </div>
              </>
            )}
            {done && <p aria-live="polite" className="text-soft">Took {elapsed(r, now)}.</p>}
            {stopErr[r.id] && <p role="alert" className="font-bold text-red">{stopErr[r.id]}</p>}
            <div className="flex flex-wrap gap-2">
              {!done && (
                <button type="button" onClick={async () => { const e = await stop(r.id); setStopErr((m) => ({ ...m, [r.id]: e ?? "" })); }} className="min-h-[52px] flex-1 rounded-2xl bg-chip px-4 font-extrabold">Stop</button>
              )}
              {ok && r.stageUrl && (
                <a href={r.stageUrl} target="_blank" rel="noreferrer" className="flex min-h-[52px] flex-1 items-center justify-center rounded-2xl bg-teal px-4 font-extrabold text-white">Open {r.stageName.toLowerCase()}</a>
              )}
              <Link href={done ? `${base}/history` : `${base}/updating?stage=${r.stageId}`} className="flex min-h-[52px] flex-1 items-center justify-center rounded-2xl bg-white px-4 font-extrabold shadow-[0_2px_8px_rgba(30,43,58,.08)]">
                {done ? "See the log" : "Open details"}
              </Link>
              {done && (
                <button type="button" aria-label="Close" onClick={() => setGone({ ...gone, [r.id]: true })} className="min-h-[52px] rounded-2xl px-4 font-bold text-soft">Close</button>
              )}
            </div>
          </section>
        );
      })}
    </aside>
  );
}
