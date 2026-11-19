// Activity record: filtering and CSV export. Pure; safe for server and browser.
import type { ActivityEvent } from "./types";

export type ActivityRow = ActivityEvent & { repo: string; project: string };

export interface ActivityFilter {
  repo?: string;
  stage?: string;
  action?: string;
  actor?: string; // login; "claude" = any Claude session; "auto" = automatic
  result?: string;
  from?: string; // YYYY-MM-DD, inclusive
  to?: string; // YYYY-MM-DD, inclusive
  q?: string; // text in the note
}

const one = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function filterFromParams(sp: Record<string, string | string[] | undefined>): ActivityFilter {
  return { repo: one(sp.repo), stage: one(sp.stage), action: one(sp.action), actor: one(sp.actor), result: one(sp.result), from: one(sp.from), to: one(sp.to), q: one(sp.q) };
}

export function toParams(f: ActivityFilter): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : "";
}

export function applyFilter(rows: ActivityRow[], f: ActivityFilter): ActivityRow[] {
  const actor = f.actor?.toLowerCase();
  const q = f.q?.toLowerCase();
  return rows.filter((e) => {
    if (f.repo && e.repo !== f.repo) return false;
    if (f.stage && e.stageId !== f.stage) return false;
    if (f.action && e.action !== f.action) return false;
    if (f.result && e.result !== f.result) return false;
    if (actor) {
      const a = e.actor.toLowerCase();
      if (actor === "claude" ? !a.startsWith("claude:") : a !== actor && a !== `claude:${actor}`) return false;
    }
    if (f.from && e.at.slice(0, 10) < f.from) return false;
    if (f.to && e.at.slice(0, 10) > f.to) return false;
    if (q && !`${e.note ?? ""} ${e.commit ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export const CSV_COLUMNS = ["time", "project", "repo", "stage", "action", "actor", "result", "commit", "run_id", "note"] as const;

/** One CSV cell: quoted when needed, and spreadsheet formulas neutralised. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: ActivityRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const e of rows) {
    lines.push([e.at, e.project, e.repo, e.stageId, e.action, e.actor, e.result, e.commit, e.runId, e.note].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
