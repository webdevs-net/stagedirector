import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { loadProject, type PageProps } from "@/components/load";
import { BackLink, ButtonLink, Chevron, Eyebrow, Page } from "@/components/ui";
import { getActivity } from "@/lib/data";
import type { ActivityEvent } from "@/lib/types";

const VERB: Record<ActivityEvent["action"], string> = {
  push: "updated", approve: "approved", pin: "pinned", unpin: "unpinned", undo: "put back", stop: "paused", request: "asked for review", decline: "request declined", "clear-cache": "cache cleared", snapshot: "backed up", check: "checked",
};

function who(actor: string) {
  if (actor === "auto") return "Automatically";
  if (actor.startsWith("claude:")) return `Claude for ${actor.slice(7)}`;
  return `By ${actor[0].toUpperCase()}${actor.slice(1)}`;
}

function dayOf(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor((today.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400000);
  if (diff <= 0) return "TODAY";
  if (diff === 1) return "YESTERDAY";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase();
}

export default async function HistoryPage({ params, searchParams }: PageProps) {
  const { project: p, base, q, sp } = await loadProject(params, searchParams);
  const filter = typeof sp.f === "string" ? sp.f : "all";
  const events = (await getActivity(decodeURIComponent((await params).repo))).filter((e) => filter === "all" || e.stageId === filter);
  const stageName = (id?: string) => p.config.stages.find((s) => s.id === id)?.name ?? "Project";
  const days = new Map<string, ActivityEvent[]>();
  for (const e of events) days.set(dayOf(e.at), [...(days.get(dayOf(e.at)) ?? []), e]);
  const extra = q ? "&as=developer" : "";

  return (
    <Page width="max-w-[860px]">
      <BackLink href={`${base}${q}`} label={p.config.name} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-extrabold">History</h1>
        <div className="flex flex-wrap gap-2">
          <Link href={`/activity?repo=${encodeURIComponent(p.repo)}`} className="inline-flex min-h-[52px] items-center rounded-2xl bg-white px-5 font-extrabold">Full record &amp; filters</Link>
          <a href={`/api/activity?repo=${encodeURIComponent(p.repo)}&format=csv`} download className="inline-flex min-h-[52px] items-center rounded-2xl bg-teal px-5 font-extrabold text-white">Download CSV</a>
        </div>
      </div>
      <nav aria-label="Filter" className="flex flex-wrap gap-2">
        {[{ id: "all", name: "Everything" }, ...p.config.stages.slice(1).reverse()].map((s) => (
          <Link key={s.id} href={`${base}/history?f=${s.id}${extra}`} aria-current={filter === s.id ? "page" : undefined}
            className={`inline-flex min-h-[52px] items-center rounded-full px-[18px] font-bold ${filter === s.id ? "bg-ink text-white" : "bg-white"}`}>
            {s.name}
          </Link>
        ))}
      </nav>
      {events.length === 0 && <p className="rounded-[22px] bg-white p-6 text-muted">Nothing here yet.</p>}
      {[...days.entries()].map(([day, list]) => (
        <section key={day} aria-label={day} className="flex flex-col gap-2.5">
          <Eyebrow>{day}</Eyebrow>
          {list.map((e) => (
            <details key={e.id} className="rounded-[22px] bg-white shadow-[0_4px_18px_rgba(30,43,58,.06)]">
              <summary className="flex min-h-[72px] flex-wrap items-center gap-3 px-5 py-2">
                <span className={`h-3 w-3 rounded-full ${e.result === "failed" || e.result === "undone" ? "bg-[#d64545]" : e.result === "stopped" ? "bg-[#e59a1a]" : "bg-[#14a39d]"}`} aria-hidden="true" />
                <span className="flex flex-1 flex-col">
                  <span className="text-lg font-extrabold">{stageName(e.stageId)} {VERB[e.action]}</span>
                  <span className="text-[15px] text-muted">{who(e.actor)} · {new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}</span>
                </span>
                <Chevron />
              </summary>
              <div className="flex flex-col gap-3 px-5 pb-5">
                <p className="text-soft">{e.note}</p>
                <div className="flex flex-wrap gap-2.5">
                  {e.action === "push" && e.result === "passed" && (
                    <ActionButton act="run" repo={p.repo} stageId={e.stageId ?? "staging"} kind="undo" className="bg-amber-soft text-[#7a4800]">
                      {p.config.noDowntime ? "Undo this update (instant switch back)" : "Undo this update"}
                    </ActionButton>
                  )}
                  <ButtonLink href={`${base}/updating?stage=${e.stageId ?? "staging"}`} tone="plain">See the log</ButtonLink>
                </div>
              </div>
            </details>
          ))}
        </section>
      ))}
    </Page>
  );
}
