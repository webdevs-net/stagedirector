"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { pinAction } from "@/app/actions";
import { Icon } from "./ui";

/** Pin (freeze) or unpin one stage. The server re-checks who may do it. */
export function PinButton({ repo, stageId, stageName, pinned }: { repo: string; stageId: string; stageName: string; pinned: boolean }) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setErr(null);
    const e = await pinAction(repo, stageId, !pinned);
    if (e) return setErr(e);
    router.refresh();
  };
  return (
    <span className="flex flex-col gap-1">
      <button type="button" disabled={pending} aria-busy={pending} onClick={() => startT(run)}
        className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-5 font-extrabold disabled:opacity-60 ${pinned ? "bg-amber-soft text-[#7a4800]" : "bg-chip"}`}>
        <Icon name="lock" /> {pending ? "Saving…" : pinned ? `Unpin ${stageName.toLowerCase()}` : `Pin ${stageName.toLowerCase()}`}
      </button>
      {err && <span role="alert" className="font-bold text-red">{err}</span>}
    </span>
  );
}
