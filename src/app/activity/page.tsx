import Link from "next/link";
import { BackLink, Chevron, Page } from "@/components/ui";
import { filterFromParams, toParams } from "@/lib/activity";
import { getAllActivity, listProjects } from "@/lib/data";
import type { ActivityEvent } from "@/lib/types";

const ACTIONS: ActivityEvent["action"][] = ["push", "approve", "undo", "stop", "pin", "unpin", "request", "decline", "clear-cache", "check"];
const RESULTS = ["passed", "failed", "stopped", "undone", "queued", "running"];
const PAGE = 100;

function who(actor: string) {
  if (actor === "auto") return "Automatically";
  if (actor.startsWith("claude:")) return `Claude for ${actor.slice(7)}`;
  return actor;
}

const field = "min-h-[52px] rounded-2xl border-2 border-line bg-white px-3 text-base";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const f = filterFromParams(sp);
  const [projects, rows] = await Promise.all([listProjects(), getAllActivity(f)]);
  const shown = Math.max(PAGE, Number(sp.n) || PAGE);
  const stages = [...new Set(projects.flatMap((p) => p.config.stages.map((s) => s.id)))];
  const one = f.repo ? projects.find((p) => p.repo === f.repo) : null;
  const csv = `/api/activity${toParams(f)}${toParams(f) ? "&" : "?"}format=csv`;

  return (
    <Page width="max-w-[1080px]">
      <BackLink href={one ? `/p/${one.repo.replace("/", "~")}/history` : "/"} label={one ? one.config.name : "All projects"} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-extrabold">Activity record{one ? ` · ${one.config.name}` : ""}</h1>
        <a href={csv} download className="inline-flex min-h-[52px] items-center rounded-2xl bg-teal px-5 font-extrabold text-white">Download CSV ({rows.length})</a>
      </div>

      <form method="get" aria-label="Filter the record" className="grid grid-cols-1 gap-2.5 rounded-[22px] bg-white p-4 shadow-[0_4px_18px_rgba(30,43,58,.06)] sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm font-bold text-muted">Project
          <select name="repo" defaultValue={f.repo ?? ""} className={field}>
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.repo} value={p.repo}>{p.config.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold text-muted">Stage
          <select name="stage" defaultValue={f.stage ?? ""} className={field}>
            <option value="">Any stage</option>
            {stages.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold text-muted">What happened
          <select name="action" defaultValue={f.action ?? ""} className={field}>
            <option value="">Anything</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold text-muted">Result
          <select name="result" defaultValue={f.result ?? ""} className={field}>
            <option value="">Any result</option>
            {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold text-muted">Person
          <input name="actor" defaultValue={f.actor ?? ""} placeholder="login, claude or auto" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold text-muted">From
          <input type="date" name="from" defaultValue={f.from ?? ""} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold text-muted">To
          <input type="date" name="to" defaultValue={f.to ?? ""} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold text-muted">Words in the note
          <input name="q" defaultValue={f.q ?? ""} className={field} />
        </label>
        <div className="flex gap-2.5 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="min-h-[52px] flex-1 rounded-2xl bg-ink px-5 font-extrabold text-white">Show</button>
          <Link href="/activity" className="flex min-h-[52px] items-center rounded-2xl bg-chip px-5 font-extrabold">Clear</Link>
        </div>
      </form>

      {rows.length === 0 && <p className="rounded-[22px] bg-white p-6 text-muted">Nothing matches.</p>}
      <ul className="flex flex-col gap-2">
        {rows.slice(0, shown).map((e) => (
          <li key={`${e.repo}-${e.id}`}>
            <details className="rounded-[18px] bg-white shadow-[0_4px_18px_rgba(30,43,58,.05)]">
              <summary className="flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                <span className={`h-3 w-3 rounded-full ${e.result === "failed" || e.result === "undone" ? "bg-[#d64545]" : e.result === "stopped" ? "bg-[#e59a1a]" : "bg-[#14a39d]"}`} aria-hidden="true" />
                <span className="min-w-[150px] text-sm text-muted">{new Date(e.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" })}</span>
                {!one && <span className="font-extrabold">{e.project}</span>}
                <span className="font-bold">{e.action}{e.stageId ? ` · ${e.stageId}` : ""}</span>
                <span className="text-soft">{who(e.actor)}</span>
                {e.result && <span className="text-sm font-bold text-muted">{e.result}</span>}
                <span className="ml-auto"><Chevron /></span>
              </summary>
              <div className="flex flex-col gap-1 px-4 pb-4 text-[15px] text-soft">
                {e.note && <p>{e.note}</p>}
                {e.commit && <p className="font-mono text-sm">commit {e.commit}</p>}
                {e.runId && <p className="text-sm">run {e.runId}</p>}
              </div>
            </details>
          </li>
        ))}
      </ul>
      {rows.length > shown && (
        <Link href={`/activity${toParams({ ...f })}${toParams(f) ? "&" : "?"}n=${shown + PAGE}`} className="flex min-h-[52px] items-center justify-center rounded-2xl bg-white font-extrabold">
          Show more ({rows.length - shown} left)
        </Link>
      )}
    </Page>
  );
}
