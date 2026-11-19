import Link from "next/link";
import { loadProject, type PageProps } from "@/components/load";
import { BackLink, Button, ButtonLink, Eyebrow, Icon, Page } from "@/components/ui";
import { ToolTile } from "@/components/ToolTile";

const svg = (d: React.ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONS = {
  cache: svg(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></>),
  backup: svg(<><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>),
  copy: svg(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>),
  plugin: svg(<><path d="M9 3v4M15 3v4" /><path d="M6 7h12v4a6 6 0 0 1-12 0z" /><path d="M12 17v4" /></>),
};

export default async function ToolboxPage({ params, searchParams }: PageProps) {
  const { project: p, base, q } = await loadProject(params, searchParams);
  const live = p.stages[p.stages.length - 1];
  const tiles = [
    { t: "Clear cache", d: "Show the newest version", on: !!p.config.tools?.clearCache, icon: ICONS.cache, kind: "clear-cache" as const },
    { t: "Save a backup", d: "Whole site, right now", on: true, icon: ICONS.backup },
    { t: "Copy live to staging", d: "Real pages and photos", on: p.config.stages.length > 2, icon: ICONS.copy },
    { t: "Update plugins", d: "Staging first, then live", on: p.config.kind?.startsWith("WordPress") ?? false, badge: 3, icon: ICONS.plugin },
  ].filter((x) => x.on);

  return (
    <Page width="max-w-[960px]">
      <BackLink href={`${base}${q}`} label={p.config.name} />
      <h1 className="text-3xl font-extrabold">Toolbox</h1>

      <section aria-labelledby="do-title" className="flex flex-col gap-3">
        <Eyebrow><span id="do-title">DO SOMETHING</span></Eyebrow>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((x) => (
            <ToolTile key={x.t} repo={p.repo} stageId={p.config.stages[p.config.stages.length - 1].id} kind={x.kind} title={x.t} detail={x.d} icon={x.icon} badge={x.badge} />
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
