"use client";

import { RUN_STEPS } from "@/lib/shared";
import { ActionButton } from "../ActionButton";
import { CheckPanel } from "../CheckPanel";
import { Icon } from "../ui";
import { runTitle } from "./RunWindow";
import { waitingText } from "./waiting";
import { useRuns } from "./RunsProvider";

export function RunDetails({ repo, stageId, stageName, demo, checkable }: { repo: string; stageId?: string; stageName: string; demo?: boolean; checkable?: boolean }) {
  const { runs } = useRuns();
  const r = [...runs].reverse().find((x) => x.repo === repo && (!stageId || x.stageId === stageId));
  const steps = r?.steps ?? RUN_STEPS;
  const current = r ? (r.state === "running" ? r.step : steps.length) : 2;
  const pct = r?.progress ?? 60;
  const running = !r || r.state === "running";
  const finished = !!r && r.state !== "running" && r.state !== "stopped" && r.kind !== "clear-cache" && r.kind !== "snapshot";
  return (
    <>
    <section className="flex flex-col items-center gap-4 rounded-[32px] bg-white p-6 text-center shadow-[0_6px_24px_rgba(30,43,58,.07)] sm:p-9">
      <div className={`flex h-[88px] w-[88px] items-center justify-center rounded-full ${r?.state === "failed" ? "bg-red-soft text-red" : running ? "bg-blue-soft text-blue" : "bg-teal-soft text-teal"}`}>
        <Icon name={running ? "refresh" : r?.state === "failed" ? "alert" : "check"} size={40} className={running ? "run-spin" : ""} />
      </div>
      <h1 className="text-3xl font-extrabold">{r ? runTitle(r) : `Updating ${stageName.toLowerCase()}…`}</h1>
      {r?.waitingForRunner && <p role="status" className="rounded-2xl bg-amber-soft px-4 py-3 text-[17px] font-bold">{waitingText(r.waitingForRunner, r.startedAt)}. It starts by itself once the runner is back, or press Stop.</p>}
      {!r && <p className="text-sm font-bold text-muted">{demo ? "(Sample run — press Update on the project page to start a real one.)" : "(Nothing is running on this stage right now.)"}</p>}
      <p className="text-[17px] text-muted">{demo ? "About 20 seconds." : "Usually a minute or two."} You can leave this page; the little window at the bottom keeps you posted.</p>
      <div role="progressbar" aria-label="Progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-3.5 w-full overflow-hidden rounded-full bg-[#e3e9f0]">
        <div className="h-full rounded-full bg-blue transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <ol aria-live="polite" className="flex w-full flex-col gap-2.5 text-left text-[17px]">
        {steps.map((s, i) => (
          <li key={s} aria-current={i === current ? "step" : undefined} className={`flex items-center gap-3 ${i === current ? "font-extrabold" : ""} ${i > current ? "text-muted" : ""}`}>
            {i < current && <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#bfe9e5] text-[#0f6f6b]"><Icon name="check" size={16} /></span>}
            {i === current && <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-blue"><span className="run-dot h-2.5 w-2.5 rounded-full bg-white" /></span>}
            {i > current && <span className="h-[30px] w-[30px] rounded-full border-2 border-line" />}
            {s}
            <span className="sr-only">{i < current ? "(done)" : i === current ? "(in progress)" : "(waiting)"}</span>
          </li>
        ))}
      </ol>
      {r?.state === "running" && <ActionButton act="stop" repo={repo} className="min-h-14 rounded-[18px] bg-chip px-7 text-lg text-ink">Stop</ActionButton>}
    </section>
    {finished && checkable && stageId && r && <CheckPanel key={r.id} repoSlug={repo.replace("/", "~")} stageId={stageId} stageName={stageName} when="after" auto />}
    </>
  );
}
