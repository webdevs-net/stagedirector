import type { LocalWork } from "@/lib/local/parse";
import { CopyButton } from "./CopyButton";
import { Chevron } from "./ui";

const STATE_LABEL: Record<string, string> = { changed: "changed", added: "added", deleted: "deleted", new: "new", renamed: "renamed", conflict: "conflict" };

/** Only rendered in local mode (dashboard on localhost + a checkout path for this repo). */
export function LocalWorkCard({ work, mainBranch }: { work: LocalWork; mainBranch: string }) {
  const n = work.files.length;
  const u = work.unpushed.length;
  const clean = n === 0 && u === 0;
  return (
    <section aria-labelledby="local-title" className="flex flex-col gap-3.5 rounded-[24px] bg-white p-5 shadow-[0_4px_18px_rgba(30,43,58,.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="local-title" className="text-xl font-extrabold">On this computer</h2>
          <p className="text-[15px] text-muted">
            Branch <b className="text-ink">{work.branch}</b> · {work.head.slice(0, 7)}
            {work.behind > 0 && <> · {work.behind} behind {work.upstream ?? `origin/${mainBranch}`}</>}
          </p>
        </div>
        <span className={`rounded-full px-3.5 py-2 text-[15px] font-bold ${clean ? "bg-teal-soft text-[#0f6f6b]" : "bg-blue-soft text-[#1f4f94]"}`}>
          {clean ? "Everything is pushed" : [n && `${n} uncommitted ${n === 1 ? "file" : "files"}`, u && `${u} ${u === 1 ? "commit" : "commits"} not pushed`].filter(Boolean).join(" · ")}
        </span>
      </div>

      {u > 0 && (
        <div className="flex flex-col gap-3 rounded-[18px] bg-blue-soft p-4">
          <p className="font-bold text-[#1f4f94]">
            GitHub (and so staging) can&apos;t see {u === 1 ? "this commit" : `these ${u} commits`} until you push.
          </p>
          <ul className="flex flex-col gap-1 text-[15px]">
            {work.unpushed.slice(0, 8).map((c) => (
              <li key={c.sha}><code className="text-muted">{c.sha.slice(0, 7)}</code> {c.subject}</li>
            ))}
            {u > 8 && <li className="text-muted">…and {u - 8} more</li>}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <code className="rounded-xl bg-white px-3.5 py-3 text-[15px]">{work.pushCommand}</code>
            <CopyButton text={`cd ${JSON.stringify(work.path)} && ${work.pushCommand}`} label="Copy push command" />
          </div>
        </div>
      )}

      {n > 0 && (
        <details className="rounded-[18px] bg-chip">
          <summary className="flex min-h-[52px] items-center gap-3 px-4 font-bold">
            <span className="flex-1">{n} uncommitted {n === 1 ? "file" : "files"} — commit them to include them</span>
            <Chevron />
          </summary>
          <ul className="flex flex-col gap-1 px-4 pb-4 text-[15px]">
            {work.files.slice(0, 40).map((f) => (
              <li key={f.path} className="flex gap-2">
                <span className={`w-20 shrink-0 font-bold ${f.state === "conflict" ? "text-amber" : "text-muted"}`}>{STATE_LABEL[f.state]}</span>
                <span className="break-all">{f.path}</span>
              </li>
            ))}
            {n > 40 && <li className="text-muted">…and {n - 40} more</li>}
          </ul>
        </details>
      )}
      <p className="text-sm text-muted">Read from {work.path}. Shown only when Stage Director runs on this computer.</p>
    </section>
  );
}
