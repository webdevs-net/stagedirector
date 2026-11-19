"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { runChecksAction } from "@/app/actions";
import type { CheckResult } from "@/lib/types";
import { Icon } from "./ui";

/** Runs the project's checks on one stage and lists the results. Each run is saved in History. */
export function CheckPanel({ repoSlug, stageId, stageName, when, auto = false }: { repoSlug: string; stageId: string; stageName: string; when: "before" | "after"; auto?: boolean }) {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startT] = useTransition();
  const started = useRef(false);

  const run = () =>
    startT(async () => {
      setErr(null);
      const r = await runChecksAction(repoSlug, stageId, when);
      if (r.error) setErr(r.error);
      setResults(r.results);
    });

  useEffect(() => {
    if (auto && !started.current) {
      started.current = true;
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const ok = results?.every((r) => r.ok);
  return (
    <section aria-labelledby={`checks-${stageId}-${when}`} className="flex flex-col gap-3 rounded-[28px] bg-white p-5 shadow-[0_6px_24px_rgba(30,43,58,.06)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`checks-${stageId}-${when}`} className="text-xl font-extrabold">
          {when === "before" ? `Checks on ${stageName.toLowerCase()}` : `Checks after the update`}
        </h2>
        <button type="button" onClick={run} disabled={pending} aria-busy={pending} className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-chip px-5 font-extrabold disabled:opacity-60">
          <Icon name="refresh" className={pending ? "run-spin" : ""} /> {pending ? "Checking…" : results ? "Check again" : "Run the checks"}
        </button>
      </div>
      {err && <p role="alert" className="font-bold text-red">{err}</p>}
      {results && results.length === 0 && !err && <p className="text-muted">No checks set up for this project. Add <code>checks:</code> to stagedirector.yml.</p>}
      {results && results.length > 0 && (
        <>
          <p aria-live="polite" className={`font-extrabold ${ok ? "text-teal-ink" : "text-red"}`}>
            {ok ? "Everything checked out." : `${results.filter((r) => !r.ok).length} of ${results.length} checks need a look.`}
          </p>
          <ul className="flex flex-col gap-2">
            {results.map((r) => (
              <li key={r.name} className={`flex items-start gap-3 rounded-2xl px-4 py-3 ${r.ok ? "bg-teal-soft" : "bg-red-soft"}`}>
                <span className={`mt-0.5 ${r.ok ? "text-teal" : "text-red"}`}><Icon name={r.ok ? "check" : "alert"} /></span>
                <span className="flex flex-col">
                  <span className="font-extrabold">{r.name}</span>
                  <span className="text-[15px] text-soft">{r.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">Saved in History.</p>
        </>
      )}
    </section>
  );
}
