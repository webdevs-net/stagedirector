"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProjectView } from "@/lib/mock";
import { repoToSlug } from "@/lib/mock";
import { StageBars } from "./StageBars";
import { Chevron, Icon } from "./ui";
import { HEALTH_LABEL, healthOf, timeAgo } from "./status";

type Filter = "all" | "needs" | "starred";

export function ProjectBrowser({ projects }: { projects: ProjectView[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [grouped, setGrouped] = useState(true);

  const needs = projects.filter((p) => p.needsMe);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return projects.filter((p) => {
      if (filter === "needs" && !p.needsMe) return false;
      if (filter === "starred" && !p.extras.starred) return false;
      if (term && !`${p.config.name} ${p.repo} ${p.config.group ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [projects, q, filter]);

  const starred = shown.filter((p) => p.extras.starred);
  const groups = useMemo(() => {
    const m = new Map<string, ProjectView[]>();
    for (const p of shown) {
      const g = grouped ? p.config.group ?? "Other" : "All projects";
      m.set(g, [...(m.get(g) ?? []), p]);
    }
    return [...m.entries()];
  }, [shown, grouped]);

  const counts = {
    ready: needs.filter((p) => healthOf(p) === "ready").length,
    sync: needs.filter((p) => healthOf(p) === "sync").length,
    fail: needs.filter((p) => healthOf(p) === "fail").length,
  };

  const pill = (active: boolean) =>
    `min-h-[52px] rounded-full px-[18px] text-base font-bold ${active ? "bg-ink text-white" : "bg-white text-ink"}`;

  return (
    <>
      {needs.length > 0 && (
        <section aria-labelledby="waiting-title" className="flex flex-wrap items-center gap-3.5 rounded-[22px] bg-blue-soft px-5 py-4">
          <span className="flex h-10 min-w-10 items-center justify-center rounded-full bg-blue px-2 text-lg font-extrabold text-white">{needs.length}</span>
          <span className="flex min-w-[200px] flex-1 flex-col">
            <h2 id="waiting-title" className="text-lg font-extrabold">Waiting on you</h2>
            <span className="text-[15px] text-soft">
              {counts.ready} ready for live · {counts.sync} out of sync · {counts.fail} failed check
            </span>
          </span>
          <button type="button" onClick={() => setFilter("needs")} className="min-h-[52px] rounded-2xl bg-blue px-5 font-extrabold text-white">
            Show them
          </button>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <label htmlFor="find" className="sr-only">Find a project</label>
        <input
          id="find"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a project…"
          className="min-h-[52px] flex-[1_1_260px] rounded-2xl border-[1.5px] border-line bg-white px-[18px] text-[17px]"
        />
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")} className={pill(filter === "all")}>All</button>
          <button type="button" aria-pressed={filter === "needs"} onClick={() => setFilter("needs")} className={pill(filter === "needs")}>Needs me · {needs.length}</button>
          <button type="button" aria-pressed={filter === "starred"} onClick={() => setFilter("starred")} className={pill(filter === "starred")}>Starred</button>
          <button type="button" aria-pressed={grouped} onClick={() => setGrouped(!grouped)} className={pill(grouped)}>Group: {grouped ? "Client" : "None"}</button>
        </div>
      </div>

      {starred.length > 0 && filter !== "starred" && (
        <section aria-labelledby="starred-title" className="flex flex-col gap-2.5">
          <h2 id="starred-title" className="text-sm font-extrabold tracking-wider text-muted">STARRED</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {starred.map((p) => {
              const h = healthOf(p);
              return (
                <li key={p.repo}>
                  <Link href={`/p/${repoToSlug(p.repo)}`} className="flex h-full flex-col gap-2.5 rounded-[20px] bg-white px-[18px] py-4 shadow-[0_4px_16px_rgba(30,43,58,.06)]">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[17px] font-extrabold">{p.config.name}</span>
                      <Icon name="star" size={18} className="text-[#d9822b]" />
                    </span>
                    <StageBars p={p} />
                    <span className={`text-sm font-bold ${HEALTH_LABEL[h].color}`}>{HEALTH_LABEL[h].text(p)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-label="All projects" className="flex flex-col gap-3">
        {groups.length === 0 && <p className="rounded-[22px] bg-white p-6 text-center text-muted">No projects match.</p>}
        {groups.map(([name, rows]) => {
          const ready = rows.filter((p) => p.waiting.length).length;
          const issues = rows.filter((p) => ["sync", "fail"].includes(healthOf(p))).length;
          const summary = [`${rows.length} ${rows.length === 1 ? "project" : "projects"}`, ready ? `${ready} ready for live` : "", issues ? `${issues} need a look` : "", !ready && !issues ? "all up to date" : ""].filter(Boolean).join(" · ");
          return (
            <details key={name} open={rows.some((p) => p.needsMe) || filter !== "all" || q !== ""} className="rounded-[22px] bg-white shadow-[0_4px_16px_rgba(30,43,58,.06)]">
              <summary className="flex min-h-16 flex-wrap items-center gap-3 px-5 py-2">
                <span className="flex-1 text-lg font-extrabold">{name}</span>
                <span className="text-[15px] font-bold text-muted">{summary}</span>
                <Chevron />
              </summary>
              <ul className="px-3 pb-3">
                {rows.map((p) => {
                  const h = healthOf(p);
                  const live = p.stages[p.stages.length - 1];
                  return (
                    <li key={p.repo}>
                      <Link href={`/p/${repoToSlug(p.repo)}`} className="flex min-h-14 flex-wrap items-center gap-3.5 border-t border-chip px-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-bold">{p.config.name}</span>
                          <span className="block text-sm text-muted">Live updated {timeAgo(live?.deployedAt ?? null)}</span>
                        </span>
                        <StageBars p={p} small />
                        <span className={`w-[150px] text-right text-sm font-bold ${HEALTH_LABEL[h].color}`}>{HEALTH_LABEL[h].text(p)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </section>
    </>
  );
}
