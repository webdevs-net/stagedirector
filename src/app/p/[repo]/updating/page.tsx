import { ActionButton } from "@/components/ActionButton";
import { loadProject, type PageProps } from "@/components/load";
import { BackLink, Chevron, Icon, Page } from "@/components/ui";
import { getRunLog } from "@/lib/mock";

const STEPS = ["Checked what's changing", "Saved a backup", "Copying files", "Making sure the site still loads"];

export default async function UpdatingPage({ params, searchParams }: PageProps) {
  const { project: p, base, q, sp } = await loadProject(params, searchParams);
  const stageId = typeof sp.stage === "string" ? sp.stage : "staging";
  const stage = p.config.stages.find((s) => s.id === stageId) ?? p.config.stages[1] ?? p.config.stages[0];
  const log = await getRunLog();
  const current = 2;
  const pct = 60;

  return (
    <Page width="max-w-[640px]">
      <BackLink href={`${base}${q}`} label={p.config.name} />
      <section className="flex flex-col items-center gap-4 rounded-[32px] bg-white p-6 text-center shadow-[0_6px_24px_rgba(30,43,58,.07)] sm:p-9">
        <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-blue-soft text-blue"><Icon name="refresh" size={40} className="animate-spin [animation-duration:3s]" /></div>
        <h1 className="text-3xl font-extrabold">Updating {stage.name.toLowerCase()}…</h1>
        <p className="text-[17px] text-muted">About a minute. You can leave this page; we&apos;ll let you know when it&apos;s done.</p>
        <div role="progressbar" aria-label="Progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-3.5 w-full overflow-hidden rounded-full bg-[#e3e9f0]">
          <div className="h-full rounded-full bg-blue" style={{ width: `${pct}%` }} />
        </div>
        <ol className="flex w-full flex-col gap-2.5 text-left text-[17px]">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === current ? "step" : undefined} className={`flex items-center gap-3 ${i === current ? "font-extrabold" : ""} ${i > current ? "text-muted" : ""}`}>
              {i < current && <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#bfe9e5] text-[#0f6f6b]"><Icon name="check" size={16} /></span>}
              {i === current && <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-blue"><span className="h-2.5 w-2.5 rounded-full bg-white" /></span>}
              {i > current && <span className="h-[30px] w-[30px] rounded-full border-2 border-line" />}
              {s}
              <span className="sr-only">{i < current ? "(done)" : i === current ? "(in progress)" : "(waiting)"}</span>
            </li>
          ))}
        </ol>
        <ActionButton act="stop" repo={p.repo} next={`${base}/history${q}`} className="min-h-14 rounded-[18px] bg-chip px-7 text-lg text-ink">Stop</ActionButton>
      </section>
      <details className="rounded-3xl bg-white shadow-[0_6px_24px_rgba(30,43,58,.06)]">
        <summary className="flex min-h-16 items-center justify-between px-6 text-lg font-extrabold"><span>Show the technical log</span><Chevron /></summary>
        <pre className="mx-4 mb-4 overflow-x-auto rounded-2xl bg-ink p-4 font-mono text-[13px] leading-relaxed text-[#e3e4ea]">{log.join("\n")}</pre>
      </details>
    </Page>
  );
}
