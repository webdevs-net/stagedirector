import type { ActivityEvent, StageStatus } from "@/lib/types";

const VERB: Record<ActivityEvent["action"], string> = {
  push: "updated", approve: "approved", pin: "pinned", unpin: "unpinned", undo: "put back", stop: "paused", request: "asked for review", decline: "request declined", "clear-cache": "cache cleared", snapshot: "backed up", "copy-live": "copied live data", check: "checked",
};

/** "updated", or what really happened when the run did not pass ("update failed", "updating"…). */
export function verbOf(e: Pick<ActivityEvent, "action" | "result">): string {
  if (e.action === "push" || e.action === "undo") {
    const what = e.action === "push" ? "update" : "undo";
    if (e.result === "failed") return `${what} failed`;
    if (e.result === "stopped") return `${what} stopped`;
    if (e.result === "queued" || e.result === "running") return e.action === "push" ? "updating" : "undoing";
  }
  return VERB[e.action];
}

/**
 * The newest update or undo of each stage, when it failed and nothing has succeeded on that stage
 * since: what the overview warns about. `events` are newest first (as getActivity returns them).
 */
export function unresolvedFailures(events: ActivityEvent[], stages: Pick<StageStatus, "stageId" | "deployedAt">[]): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  for (const s of stages) {
    const newest = events.find((e) => e.stageId === s.stageId && (e.action === "push" || e.action === "undo"));
    if (!newest || newest.result !== "failed") continue;
    if (s.deployedAt && Date.parse(s.deployedAt) >= Date.parse(newest.at)) continue;
    out.push(newest);
  }
  return out;
}
