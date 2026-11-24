"use client";

import { useState, useTransition } from "react";
import { Icon } from "./ui";
import { useRuns } from "./runs/RunsProvider";

/**
 * App projects: build the first stage (the beta) from a chosen release tag, not from the branch head.
 * The run, its GitHub Deployment, the approval and the later release all use the tag's commit,
 * so other pull requests merged after tagging don't get in the way.
 */
export function BuildFromTag({ repo, stageId, stageName, tags, current }: {
  repo: string;
  stageId: string;
  stageName: string;
  tags: { tag: string; commit: string }[];
  /** Commit already on the stage, so it is marked. */
  current: string | null;
}) {
  const { start, runFor } = useRuns();
  const [pick, setPick] = useState(tags.find((t) => t.commit !== current)?.commit ?? tags[0]?.commit ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startT] = useTransition();
  const busy = !!runFor(repo);
  if (!tags.length) {
    return (
      <p className="rounded-[22px] bg-chip p-5 text-center text-soft">
        No release tag on the main branch yet. Tag a release (for Loquio: <code>scripts/tag-release.sh</code>), then build the {stageName.toLowerCase()} here.
      </p>
    );
  }
  const chosen = tags.find((t) => t.commit === pick);
  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex flex-wrap items-center gap-3 text-lg font-bold">
        <span>Release tag</span>
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="min-h-12 rounded-xl border-2 border-[#c9d8ea] bg-white px-3 font-extrabold">
          {tags.map((t) => (
            <option key={t.commit} value={t.commit}>
              {t.tag} · {t.commit.slice(0, 7)}{t.commit === current ? ` · on ${stageName.toLowerCase()} now` : ""}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={pending || busy || !chosen}
        onClick={() => startT(async () => { setErr(null); const e = await start(repo, stageId, "update", pick); if (e) setErr(e); })}
        className="inline-flex min-h-[72px] w-full items-center justify-center gap-2 rounded-[22px] bg-blue px-5 text-[21px] font-extrabold text-white shadow-[0_8px_20px_rgba(37,99,184,.28)] disabled:opacity-60"
      >
        {pending ? "Starting…" : busy ? "Busy — one run at a time" : <><Icon name="refresh" size={24} /> Build the {stageName.toLowerCase()} from {chosen?.tag}</>}
      </button>
      {err && <p role="alert" className="font-bold text-red">{err}</p>}
    </div>
  );
}
