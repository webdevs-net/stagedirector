import { Banner } from "@/components/Banner";
import { loadProject, type PageProps } from "@/components/load";
import { timeAgo } from "@/components/status";
import { BackLink, Button, ButtonLink, Card, Chevron, Icon, Page } from "@/components/ui";
import { UpdateStagingButton } from "@/components/UpdateStagingButton";
import { RunOverlay } from "@/components/runs/RunOverlay";

export default async function ProjectPage({ params, searchParams }: PageProps) {
  const { project: p, viewer, base, q } = await loadProject(params, searchParams);
  const stages = p.config.stages;
  const first = stages[0];
  const last = stages[stages.length - 1];
  const middle = stages.length > 2 ? stages[stages.length - 2] : null;
  const st = (id: string) => p.stages.find((s) => s.stageId === id);
  const isOwner = viewer.role === "code-owner";
  const approved = !!p.extras.approval;
  const n = p.waiting.length;
  const liveSync = st(last.id)?.outOfSync ?? [];

  return (
    <Page>
      <BackLink href="/" label="All projects" />
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-muted">
            {viewer.name} · {isOwner ? "code owner" : "developer"}
          </p>
          <h1 className="text-[34px] font-extrabold leading-tight">{p.config.name}</h1>
        </div>
        <nav aria-label="Project" className="flex flex-wrap gap-2.5">
          <ButtonLink href={`${base}/toolbox${q}`} className="rounded-full">Toolbox</ButtonLink>
          <ButtonLink href={`${base}/history${q}`} className="rounded-full">History</ButtonLink>
        </nav>
      </header>

      <div className="flex flex-col gap-3">
        {p.busy && <Banner kind="busy" title={`${p.busy.by} is updating ${p.busy.stageId}`} detail="Other buttons wait until it's done · about 1 min" action={{ label: "Watch", href: `${base}/updating${q}` }} />}
        {p.extras.safetyNetUndid && <Banner kind="undid" title="Safety net undid an update" detail={p.extras.safetyNetUndid} action={{ label: "Why?", href: `${base}/history${q}` }} />}
        {liveSync.length > 0 && <Banner kind="sync" title="Out of sync" detail={`Someone changed ${liveSync.length} file on the ${last.name.toLowerCase()} directly`} action={{ label: "Look", href: `${base}/toolbox${q}#sync` }} />}
        {p.extras.quietHours && <Banner kind="quiet" title="Quiet hours" detail={p.extras.quietHours} />}
        {p.extras.stagingReady && middle && <Banner kind="ready" title={`${middle.name} is ready to look at`} detail="Also sent by email · Alerts" action={{ label: "Open", href: middle.url ?? "#" }} />}
      </div>

      {middle && (
        <RunOverlay repo={p.repo}>
        <Card aria-labelledby="work-title" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="work-title" className="text-2xl font-extrabold">Everyday work</h2>
            {middle.trigger === "auto" && <span className="rounded-full bg-teal-soft px-3.5 py-2 text-[15px] font-bold text-[#0f6f6b]">{middle.name} updates by itself when {p.config.branch} changes</span>}
          </div>
          <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_56px_1fr]">
            <div className="flex flex-col gap-1.5 rounded-3xl bg-chip p-5">
              <span className="text-sm font-extrabold tracking-wider text-muted">{p.config.branch.toUpperCase()}</span>
              <span className="text-xl font-extrabold">Your {first.name.toLowerCase()} work</span>
              <span className="text-[15px] text-muted">Latest: {p.waiting[p.waiting.length - 1]?.title ?? "no new changes"}</span>
              {first.url && <ButtonLink href={first.url} className="mt-2.5 min-h-14">Open {first.name.toLowerCase()} site</ButtonLink>}
            </div>
            <div aria-hidden="true" className="flex justify-center text-[#b9c7d6] max-md:rotate-90"><Icon name="arrow" size={40} /></div>
            <div className="flex flex-col gap-1.5 rounded-3xl bg-teal-soft p-5">
              <span className="text-sm font-extrabold tracking-wider text-[#0f6f6b]">{middle.name.toUpperCase()}</span>
              <span className="text-xl font-extrabold">{(st(middle.id)?.behindBy ?? 0) === 0 ? `Up to date with ${p.config.branch}` : `${st(middle.id)?.behindBy} behind ${p.config.branch}`}</span>
              <span className="text-[15px] text-teal-ink">Updated {timeAgo(st(middle.id)?.deployedAt ?? null)} · everything checked out</span>
              {middle.url && <ButtonLink href={middle.url} className="mt-2.5 min-h-14 text-teal-ink">Open {middle.name.toLowerCase()}</ButtonLink>}
            </div>
          </div>
          <UpdateStagingButton repo={p.repo} stageId={middle.id} label={`Update ${middle.name.toLowerCase()} from ${p.config.branch}`} />
        </Card>
        </RunOverlay>
      )}

      <section aria-labelledby="changes-title" className="flex flex-col gap-3">
        <h2 id="changes-title" className="text-xl font-extrabold">
          On {middle?.name.toLowerCase() ?? first.name.toLowerCase()}, not on {last.name.toLowerCase()} yet <span className="text-base font-bold text-muted">· {n} {n === 1 ? "change" : "changes"}</span>
        </h2>
        {n === 0 && <p className="rounded-[22px] bg-white p-6 text-muted">Nothing waiting. {last.name} matches {middle?.name.toLowerCase() ?? "main"}.</p>}
        {p.waiting.map((c, i) => (
          <details key={c.pr} open={i === 0} className="rounded-[22px] bg-white shadow-[0_4px_18px_rgba(30,43,58,.06)]">
            <summary className="flex min-h-[72px] items-center gap-3.5 px-5">
              <span className="flex-1 text-lg font-extrabold">{c.title}</span>
              <span className="text-sm font-bold text-muted">PR #{c.pr}</span>
              <Chevron />
            </summary>
            <div className="flex flex-col gap-3.5 px-5 pb-5">
              <p className="leading-relaxed text-soft">{c.summary}</p>
              <div className="flex flex-wrap gap-2.5">
                {middle?.url && <ButtonLink href={new URL(c.pages?.[0] ?? "/", middle.url).toString()} tone="plain" className="bg-teal-soft text-teal-ink">See on {middle.name.toLowerCase()}</ButtonLink>}
                {last.url && <ButtonLink href={new URL(c.pages?.[0] ?? "/", last.url).toString()} tone="amber">See live now</ButtonLink>}
                <ButtonLink href={c.url} tone="plain">Full details</ButtonLink>
              </div>
            </div>
          </details>
        ))}
      </section>

      <RunOverlay repo={p.repo} stageIds={[last.id]}>
      <section aria-labelledby="live-title" className="flex flex-col gap-4 rounded-[28px] border-2 border-dashed border-[#c9d8ea] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-soft text-amber"><Icon name="lock" size={22} /></span>
            <div>
              <h2 id="live-title" className="text-[21px] font-extrabold">{last.name}</h2>
              <span className="text-[15px] text-muted">Only code owners can put changes live</span>
            </div>
          </div>
          {last.url && <ButtonLink href={last.url} tone="amber">Open {last.name.toLowerCase()}</ButtonLink>}
        </div>

        <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <li className="flex flex-col gap-1 rounded-[18px] bg-teal-soft px-4 py-3.5">
            <span className="text-[13px] font-extrabold text-[#0f6f6b]">1 · DONE</span>
            <span className="font-extrabold">On {middle?.name.toLowerCase() ?? "main"}</span>
          </li>
          <li className={`flex flex-col gap-1 rounded-[18px] px-4 py-3.5 ${approved ? "bg-teal-soft" : "border-2 border-blue bg-blue-soft"}`} aria-current={approved ? undefined : "step"}>
            <span className={`text-[13px] font-extrabold ${approved ? "text-[#0f6f6b]" : "text-[#1f4f94]"}`}>2 · {approved ? "DONE" : "NOW"}</span>
            <span className="font-extrabold">Code owner approves</span>
          </li>
          <li className={`flex flex-col gap-1 rounded-[18px] px-4 py-3.5 ${approved ? "border-2 border-blue bg-blue-soft" : "bg-chip"}`}>
            <span className={`text-[13px] font-extrabold ${approved ? "text-[#1f4f94]" : "text-muted"}`}>3 · {approved ? "NOW" : "LOCKED"}</span>
            <span className={`font-extrabold ${approved ? "" : "text-muted"}`}>Put on live</span>
          </li>
        </ol>

        {isOwner ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ButtonLink href={`${base}/review${q}`} tone="blue" className="min-h-16 text-[19px]">Review and approve</ButtonLink>
            {approved ? (
              <ButtonLink href={`${base}/live${q}`} tone="blue" className="min-h-16 text-[19px]">Put on live</ButtonLink>
            ) : (
              <Button disabled aria-describedby="live-lock" className="min-h-16 bg-[#e3e9f0] text-[19px] text-soft">
                <Icon name="lock" /> Put on live
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button tone="blue" className="min-h-16 text-[19px]">Ask a code owner</Button>
            <Button disabled aria-describedby="live-lock" className="min-h-16 bg-[#e3e9f0] text-[19px] text-soft"><Icon name="lock" /> Put on live</Button>
          </div>
        )}
        <p id="live-lock" className="text-center text-[15px] text-muted">
          {approved
            ? `Approved by ${p.extras.approval?.by}. Ready to put live.`
            : isOwner
              ? `Unlocks once a code owner approves ${n === 1 ? "this change" : `these ${n} changes`}.`
              : "Only code owners can approve and put changes live. Ask one to review."}
        </p>
        <p className="text-center text-sm text-muted">
          Preview as:{" "}
          <a className="font-bold text-blue underline" href={base}>code owner</a> ·{" "}
          <a className="font-bold text-blue underline" href={`${base}?as=developer`}>developer</a>
        </p>
      </section>
      </RunOverlay>
    </Page>
  );
}
