import type { ProjectView } from "@/lib/mock";

export type Health = "ok" | "ready" | "sync" | "fail" | "busy";

export function healthOf(p: ProjectView): Health {
  if (p.busy) return "busy";
  if (p.extras.failedCheck) return "fail";
  if (p.stages.some((s) => s.outOfSync.length > 0) && p.waiting.length === 0) return "sync";
  if (p.waiting.length > 0) return "ready";
  if (p.stages.some((s) => s.outOfSync.length > 0)) return "sync";
  return "ok";
}

export const HEALTH_LABEL: Record<Health, { text: (p: ProjectView) => string; color: string }> = {
  ok: { text: () => "Up to date", color: "text-[#0f6f6b]" },
  ready: { text: (p) => `${p.waiting.length} ready for live`, color: "text-blue" },
  sync: { text: () => "Out of sync", color: "text-[#9a5b12]" },
  fail: { text: () => "Check failed", color: "text-red" },
  busy: { text: (p) => `${p.busy?.by} is updating`, color: "text-blue" },
};

/** Color for each stage bar (one per stage). */
export function barColors(p: ProjectView): string[] {
  const h = healthOf(p);
  return p.config.stages.map((st, i) => {
    if (i === 0) return "#c8d3df";
    const last = i === p.config.stages.length - 1;
    const status = p.stages.find((s) => s.stageId === st.id);
    if (status?.outOfSync.length) return "#e59a1a";
    if (h === "fail" && !last) return "#d64545";
    if (h === "busy" && !last) return "#2563b8";
    if (last && p.waiting.length) return "#2563b8";
    return "#14a39d";
  });
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const now = Date.parse("2026-11-18T15:22:00-08:00");
  const min = Math.round((now - Date.parse(iso)) / 60000);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
