import type { ProjectView } from "@/lib/data";

export type Health = "ok" | "ready" | "sync" | "fail" | "busy" | "unknown";

export function healthOf(p: ProjectView): Health {
  if (p.busy) return "busy";
  if (p.extras.failedCheck) return "fail";
  if (p.lastKnown === null) return "unknown"; // live never deployed or checked: nothing to call "up to date"
  if (p.stages.some((s) => s.outOfSync.length > 0) && p.waiting.length === 0) return "sync";
  if (p.waiting.length > 0) return "ready";
  if (p.stages.some((s) => s.outOfSync.length > 0)) return "sync";
  return "ok";
}

export const HEALTH_LABEL: Record<Health, { text: (p: ProjectView) => string; color: string }> = {
  ok: { text: () => "Up to date", color: "text-[#0f6f6b]" },
  ready: { text: (p) => `${p.waiting.length} ready for live`, color: "text-amber" },
  sync: { text: () => "Out of sync", color: "text-[#9a5b12]" },
  fail: { text: () => "Check failed", color: "text-red" },
  busy: { text: (p) => `${p.busy?.by} is updating`, color: "text-blue" },
  unknown: { text: (p) => `${p.config.stages[p.config.stages.length - 1].name} not checked`, color: "text-muted" },
};

/** Color for each stage bar (one per stage). */
export function barColors(p: ProjectView): string[] {
  // A progress bar for the newest change: lit up to the stage it has reached,
  // grey after that. Problems (updating, failed check, out of sync) override.
  const stages = p.config.stages;
  const last = stages.length - 1;
  const statusOf = (id: string) => p.stages.find((s) => s.stageId === id);
  let reached = last;
  if (p.waiting.length) reached = last - 1;
  for (let i = 1; i < last; i++) {
    if ((statusOf(stages[i].id)?.behindBy ?? 0) > 0) { reached = Math.min(reached, i - 1); break; }
  }
  // A stage people push to, with no deploy or check on record, has not been reached: it is never lit.
  for (let i = 1; i <= last; i++) {
    const s = statusOf(stages[i].id);
    if (stages[i].pushers !== "none" && !s?.commit && !s?.running) { reached = Math.min(reached, i - 1); break; }
  }
  return stages.map((st, i) => {
    const status = statusOf(st.id);
    if (status?.outOfSync.length) return "#e59a1a";
    if (p.busy?.stageId === st.id || status?.running) return "#2563b8";
    if (p.extras.failedCheck && i > 0 && i < last) return "#d64545";
    return i <= reached ? "#14a39d" : "#c8d3df";
  });
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
