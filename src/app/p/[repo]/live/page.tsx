import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { loadProject, type PageProps } from "@/components/load";
import { Chevron, Icon } from "@/components/ui";
import { dataIsLive } from "@/lib/data";

export default async function PutLivePage({ params, searchParams }: PageProps) {
  const { project: p, viewer, base, q, sp } = await loadProject(params, searchParams);
  const last = p.config.stages[p.config.stages.length - 1];
  const host = last.url ? new URL(last.url).host : last.name;
  const n = p.waiting.length;
  // In demo mode ?approved=1 stands in for the stored approval; with GitHub only a real approval counts.
  const approval = p.extras.approval ?? (sp.approved === "1" && viewer.role === "code-owner" && !(await dataIsLive()) ? { by: viewer.name, at: "just now" } : null);
  const sync = p.stages[p.stages.length - 1]?.outOfSync ?? [];
  const canPush = viewer.role === "code-owner" && !!approval;

  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-[rgba(43,45,66,.35)] px-4 py-8 sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="flex w-full max-w-[580px] flex-col gap-5 rounded-[32px] bg-white p-6 shadow-[0_30px_80px_rgba(30,43,58,.3)] sm:p-9">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-blue-soft text-blue"><Icon name="globe" size={34} /></div>
          <h1 id="dlg-title" className="text-[28px] font-extrabold leading-tight">Put {n} {n === 1 ? "change" : "changes"} on the {last.name.toLowerCase()}?</h1>
          <p className="max-w-[420px] text-[17px] text-muted">Visitors to {host} will see them right away. A backup is saved first, so you can undo with one click.</p>
        </div>

        <ul className="flex flex-col gap-2 rounded-[20px] bg-bg px-5 py-4 text-[17px]">
          {p.waiting.map((c) => (
            <li key={c.pr} className="flex items-center gap-2.5"><Icon name="check" className="text-[#0f6f6b]" /> {c.title}</li>
          ))}
        </ul>

        {sync.length > 0 && (
          <details className="rounded-[20px] bg-amber-soft">
            <summary className="flex min-h-14 items-center justify-between gap-2 px-5 font-bold text-amber">
              <span>{sync.length} file was edited on the live server</span><Chevron />
            </summary>
            <div className="px-5 pb-4 text-[15px] text-[#6b4a12]">{p.extras.outOfSyncNote ?? sync.join(", ")}</div>
          </details>
        )}

        {p.extras.files.length > 0 && (
          <details>
            <summary className="flex min-h-11 items-center justify-center font-bold text-muted">Show files ({p.extras.files.length})</summary>
            <p className="pt-1.5 text-sm text-soft">{p.extras.files.join(" · ")}</p>
          </details>
        )}

        {approval ? (
          <div className="flex min-h-16 items-center gap-3.5 rounded-[18px] bg-teal-soft px-4 py-2.5 text-[17px]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal text-white"><Icon name="check" size={18} /></span>
            <span className="flex flex-col">
              <span className="font-extrabold">Approved by {approval.by} · code owner</span>
              <span className="text-[15px] text-teal-ink">{approval.at} · these exact {n} changes, checked on staging</span>
            </span>
          </div>
        ) : (
          <div className="flex min-h-16 items-center gap-3.5 rounded-[18px] bg-chip px-4 py-2.5 text-[17px]">
            <Icon name="lock" /> <span className="font-bold">Not approved yet. A code owner must review and approve first.</span>
          </div>
        )}

        <p className={`rounded-[18px] px-4 py-3 text-[15px] ${p.config.noDowntime ? "bg-teal-soft text-teal-ink" : "bg-chip text-soft"}`}>
          {p.config.noDowntime
            ? "No-downtime switch: the new version is prepared next to the old one, then swapped in one step. Visitors never see a half-updated site, and Undo takes seconds."
            : "Normal update: files are copied over the running site, so it can be slow for a moment. Undo restores the backup."}
        </p>

        <div className="flex flex-col gap-2.5">
          {canPush ? (
            <ActionButton act="run" repo={p.repo} stageId={last.id} kind="put-live" next={`${base}${q}`} className="min-h-[72px] rounded-[22px] bg-blue text-[21px] text-white shadow-[0_8px_20px_rgba(37,99,184,.3)]">
              Yes, put it live
            </ActionButton>
          ) : (
            <Link href={`${base}/review${q}`} className="flex min-h-[72px] items-center justify-center rounded-[22px] bg-blue text-[21px] font-extrabold text-white">
              {viewer.role === "code-owner" ? "Review and approve first" : "Ask a code owner"}
            </Link>
          )}
          <Link href={`${base}${q}`} className="flex min-h-14 items-center justify-center text-lg font-bold text-soft">Not now</Link>
        </div>
      </div>
    </div>
  );
}
