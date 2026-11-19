"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { approveForLive } from "@/app/actions";
import type { RunKind } from "@/lib/data";
import { useRuns } from "./runs/RunsProvider";

type Props = {
  repo: string;
  next?: string;
  className?: string;
  children: ReactNode;
} & ({ act: "approve"; arg: string } | { act: "run"; stageId: string; kind: RunKind } | { act: "stop" });

export function ActionButton(props: Props) {
  const { repo, next, className = "", children } = props;
  const router = useRouter();
  const { start, stop, runFor } = useRuns();
  const [pending, startT] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const busy = props.act === "run" && !!runFor(repo);

  const run = async () => {
    setErr(null);
    if (props.act === "approve") await approveForLive(repo, props.arg);
    if (props.act === "run") {
      const e = await start(repo, props.stageId, props.kind);
      if (e) return setErr(e);
    }
    if (props.act === "stop") {
      const r = runFor(repo);
      const e = r ? await stop(r.id) : null;
      if (e) return setErr(e);
    }
    if (next) router.push(next);
  };
  return (
    <>
      <button type="button" disabled={pending || busy} aria-busy={pending} onClick={() => startT(run)} className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-5 font-extrabold disabled:opacity-60 ${className}`}>
        {pending ? "Starting…" : busy ? "Busy — one run at a time" : children}
      </button>
      {err && <p role="alert" className="font-bold text-red">{err}</p>}
    </>
  );
}
