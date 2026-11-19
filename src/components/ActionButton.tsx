"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import * as actions from "@/app/actions";

type Act = "approve" | "putLive" | "stop" | "undo";

export function ActionButton({ act, repo, arg = "", next, className = "", children }: { act: Act; repo: string; arg?: string; next?: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = async () => {
    if (act === "approve") await actions.approveForLive(repo, arg);
    if (act === "putLive") await actions.putLive(repo, arg);
    if (act === "stop") await actions.stopRun(repo);
    if (act === "undo") await actions.undoEvent(repo, arg);
    if (next) router.push(next);
  };
  return (
    <button type="button" disabled={pending} aria-busy={pending} onClick={() => start(run)} className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-5 font-extrabold disabled:opacity-60 ${className}`}>
      {pending ? "Working…" : children}
    </button>
  );
}
