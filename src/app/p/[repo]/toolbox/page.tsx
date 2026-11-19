import Link from "next/link";
import { loadProject, type PageProps } from "@/components/load";
import { BackLink, Button, ButtonLink, Eyebrow, Icon, Page } from "@/components/ui";

export default async function ToolboxPage({ params, searchParams }: PageProps) {
  const { project: p, base, q } = await loadProject(params, searchParams);
  const live = p.stages[p.stages.length - 1];
  const tiles = [
    { t: "Clear cache", d: "Show the newest version", on: !!p.config.tools?.clearCache },
    { t: "Save a backup", d: "Whole site, right now", on: true },
    { t: "Copy live to staging", d: "Real pages and photos", on: p.config.stages.length > 2 },
    { t: "Update plugins", d: "Staging first, then live", on: p.config.kind?.startsWith("WordPress") ?? false, badge: 3 },
  ].filter((x) => x.on);

  return (
    <Page width="max-w-[960px]">
      <BackLink href={`${base}${q}`} label={p.config.name} />
      <h1 className="text-3xl font-extrabold">Toolbox</h1>

      <section aria-labelledby="do-title" className="flex flex-col gap-3">
        <Eyebrow><span id="do-title">DO SOMETHING</span></Eyebrow>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((x) => (
            <button key={x.t} type="button" className="relative flex min-h-[120px] flex-col items-start justify-end gap-1 rounded-3xl bg-white p-5 text-left shadow-[0_4px_16px_rgba(30,43,58,.06)] hover:bg-blue-soft">
              {x.badge && <span className="absolute right-4 top-4 rounded-full bg-blue px-2.5 text-sm font-extrabold text-white" aria-label={`${x.badge} waiting`}>{x.badge}</span>}
              <span className="text-lg font-extrabold">{x.t}</span>
              <span className="text-[15px] text-muted">{x.d}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="safe-title" className="flex flex-col gap-3">
        <Eyebrow><span id="safe-title">KEEPING THE SITE SAFE</span></Eyebrow>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SafeCard title="Safety net" body="If an update breaks something, it's undone by itself"><Toggle label="Safety net" on /></SafeCard>
          <SafeCard id="sync" title="Sync check" body={live?.outOfSync.length ? `${live.outOfSync.length} file on live was changed outside git` : "Live matches git"}>
            {live?.outOfSync.length ? <ButtonLink href={`${base}/history${q}`} tone="amber">Look</ButtonLink> : <span className="font-bold text-[#0f6f6b]">All good</span>}
          </SafeCard>
          <SafeCard title="Site watch" body="Live site is up · checked 1 min ago"><span className="flex items-center gap-1.5 font-bold text-[#0f6f6b]"><Icon name="check" /> Up</span></SafeCard>
          <SafeCard title="Quiet hours" body="No live updates Fri 5 pm – Mon 8 am"><Toggle label="Quiet hours" on={false} /></SafeCard>
        </div>
      </section>

      <section aria-labelledby="set-title" className="flex flex-col gap-3">
        <Eyebrow><span id="set-title">SETTINGS</span></Eyebrow>
        <ul className="overflow-hidden rounded-3xl bg-white shadow-[0_4px_16px_rgba(30,43,58,.06)]">
          {[["Alerts", "Email"], ["People", "2"], ["Engine", "Running"]].map(([k, v]) => (
            <li key={k} className="border-t border-chip first:border-0">
              <button type="button" className="flex min-h-[60px] w-full items-center justify-between px-5 text-left">
                <span className="text-lg font-bold">{k}</span><span className="text-muted">{v}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-center text-sm text-muted"><Link href="/banners" className="font-bold text-blue underline">See every banner style</Link></p>
    </Page>
  );
}

function SafeCard({ id, title, body, children }: { id?: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <div id={id} className="flex flex-wrap items-center gap-3 rounded-3xl bg-white p-5 shadow-[0_4px_16px_rgba(30,43,58,.06)]">
      <div className="min-w-[180px] flex-1"><h3 className="text-lg font-extrabold">{title}</h3><p className="text-[15px] text-muted">{body}</p></div>
      {children}
    </div>
  );
}

function Toggle({ label, on }: { label: string; on: boolean }) {
  return (
    <Button role="switch" aria-checked={on} aria-label={label} className={`rounded-full ${on ? "bg-teal text-white" : "bg-chip text-ink"}`}>
      {on ? "On" : "Off"}
    </Button>
  );
}
