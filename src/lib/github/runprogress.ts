// Run progress written by a self-hosted runner on this machine (engine/workflow
// step "Note progress on this machine", one JSON line per step) to
// STAGEDIRECTOR_RUNNER_PROGRESS/<owner>~<repo>.jsonl. Lets the run window follow
// a run with no GitHub API calls. Display only.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { RunInfo } from "./repo";

export interface ProgressLine { run: number; repo: string; stage: string; commit: string; action: string; by: string; state: "running" | "passed" | "failed" | "stopped"; step: number; at: string; url: string }

export function progressFile(repo: string): string | null {
  const dir = process.env.STAGEDIRECTOR_RUNNER_PROGRESS;
  if (!dir || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return path.join(dir, `${repo.replace("/", "~")}.jsonl`);
}

/** Pure: newest line per run, newest runs first, only runs touched in the last `withinMs`. */
export function latestPerRun(text: string, now: number, withinMs = 2 * 60 * 60_000): ProgressLine[] {
  const byRun = new Map<number, { first: ProgressLine; last: ProgressLine }>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const l = JSON.parse(line) as ProgressLine;
      if (typeof l.run !== "number" || now - Date.parse(l.at) > withinMs) continue;
      const cur = byRun.get(l.run);
      byRun.set(l.run, { first: cur?.first ?? l, last: l });
    } catch {
      /* skip a half-written line */
    }
  }
  return [...byRun.values()]
    .map(({ first, last }) => ({ ...last, startedAt: first.at }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Runs from the local file as RunInfo (+ plain step), or null when there is no file. */
export function localRuns(repo: string, now = Date.now()): (RunInfo & { step: number })[] | null {
  const f = progressFile(repo);
  if (!f || !existsSync(f)) return null;
  if (statSync(f).size > 5 << 20) return null; // keep it cheap; the runner's file should be rotated
  return latestPerRun(readFileSync(f, "utf8"), now).map((l) => ({
    id: l.run,
    action: l.action || null,
    stageId: l.stage || null,
    commit: l.commit || null,
    by: l.by || null,
    state: l.state,
    url: l.url,
    startedAt: (l as ProgressLine & { startedAt: string }).startedAt,
    updatedAt: l.at,
    step: l.step,
  }));
}
