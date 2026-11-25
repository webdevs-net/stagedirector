"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { answerRequestAction } from "@/app/actions";
import type { PushRequest, StageConfig } from "@/lib/types";

const WANTS: Record<PushRequest["wants"], string> = {
  deploy: "update", rollback: "undo the last update on", pin: "pin", unpin: "unpin", "clear-cache": "clear the cache on", snapshot: "back up", "copy-live": "copy live data into", approve: "approve the changes for",
};

/** Requests from Claude sessions. A person OKs or declines each one; Claude never can. */
export function RequestsCard({ repo, requests, stages, answerable }: { repo: string; requests: PushRequest[]; stages: StageConfig[]; answerable: string[] }) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const [err, setErr] = useState<Record<string, string>>({});
  if (!requests.length) return null;
  const answer = (id: string, ok: boolean) =>
    startT(async () => {
      const e = await answerRequestAction(repo, id, ok);
      if (e) setErr((m) => ({ ...m, [id]: e }));
      else router.refresh();
    });
  return (
    <section aria-labelledby="req-title" className="flex flex-col gap-3 rounded-[28px] border-2 border-blue bg-blue-soft p-5 sm:p-6">
      <h2 id="req-title" className="text-xl font-extrabold">Claude asks · waiting for a person&apos;s OK</h2>
      <ul className="flex flex-col gap-3">
        {requests.map((r) => {
          const stage = stages.find((s) => s.id === r.stageId);
          const live = stage?.pushers === "code-owners";
          return (
            <li key={r.id} className="flex flex-col gap-2.5 rounded-[20px] bg-white p-4">
              <p className="text-lg font-extrabold">Claude for {r.actor.slice(7)} wants to {WANTS[r.wants]} {stage?.name.toLowerCase() ?? r.stageId}</p>
              {r.note && <p className="text-soft">{r.note.replace(/^asks to \S+: ?/, "")}</p>}
              <p className="text-sm text-muted">
                {new Date(r.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                {r.commit ? ` · commit ${r.commit.slice(0, 7)}` : ""} · {live ? "needs a code owner's OK (and approves this exact commit)" : "needs a person's OK"}
              </p>
              {answerable.includes(r.stageId) ? (
                <div className="flex flex-wrap gap-2.5">
                  <button type="button" disabled={pending} onClick={() => answer(r.id, true)} className="min-h-[52px] rounded-2xl bg-blue px-5 font-extrabold text-white disabled:opacity-60">OK, do it</button>
                  <button type="button" disabled={pending} onClick={() => answer(r.id, false)} className="min-h-[52px] rounded-2xl bg-chip px-5 font-extrabold disabled:opacity-60">Decline</button>
                </div>
              ) : (
                <p className="font-bold text-[#1f4f94]">{live ? "Only a code owner can OK this." : "You can look but not answer."}</p>
              )}
              {err[r.id] && <p role="alert" className="font-bold text-red">{err[r.id]}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
