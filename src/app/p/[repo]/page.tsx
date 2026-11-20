import { ProjectNav } from "@/components/ProjectNav";
import { Banner } from "@/components/Banner";
import { loadProject, type PageProps } from "@/components/load";
import { Button, ButtonLink, Card, Chevron, Icon, Page } from "@/components/ui";
import { UpdateStagingButton } from "@/components/UpdateStagingButton";
import { StagingCard } from "@/components/StagingCard";
import { RunOverlay } from "@/components/runs/RunOverlay";
import { LocalWorkCard } from "@/components/LocalWorkCard";
import { readLocalWork } from "@/lib/local/git";
import { runningDetail, runningHeadline } from "@/components/runningText";
import { PinButton } from "@/components/PinButton";
import { RequestsCard } from "@/components/RequestsCard";
import { mayAnswer } from "@/lib/auth/permissions";
import { PreviewToggle } from "@/components/PreviewToggle";
import { RunnerBanner } from "@/components/RunnerBanner";
import { runnerStatus } from "@/lib/data";

export default async function ProjectPage({ params, searchParams }: PageProps) {
  const { project: p, viewer, realRole, base, q, sp } = await loadProject(params, searchParams);
  const stages = p.config.stages;
  const first = stages[0];
  const last = stages[stages.length - 1];
  const middle = stages.length > 2 ? stages[stages.length - 2] : null;
  const st = (id: string) => p.stages.find((s) => s.stageId === id);
  const isOwner = viewer.role === "code-owner";
  const approved = !!p.extras.approval;
  const n = p.waiting.length;
  const liveSync = st(last.id)?.outOfSync ?? [];
  const [local, runnerHealth] = await Promise.all([readLocalWork(p.repo, p.config.branch), runnerStatus([p])]);
  const midRunning = middle ? st(middle.id)?.running ?? null : null;
  const liveRunning = st(last.id)?.running ?? null;
  const middlePinned = !!middle && !!st(middle.id)?.pinned;
  const livePinned = !!st(last.id)?.pinned;
  const pinnable = stages.filter((s) => s.pushers !== "none");
  const mayPin = (s: (typeof stages)[number]) => (s.pushers === "code-owners" ? isOwner : viewer.role !== "viewer");
  // Stages whose Claude requests this viewer may OK (the server checks again).
  const answerable = stages.filter((s) => mayAnswer(p.config, s.id, viewer.login, viewer.role).ok).map((s) => s.id);

  return (
    <Page>
      <ProjectNav name={p.config.name} base={base} q={q} active="overview" />
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-muted">
            {viewer.name} · {isOwner ? "code owner" : "developer"}
          </p>
          <h1 className="text-[34px] font-extrabold leading-tight">{p.config.name}</h1>
        </div>
      </header>

      <RequestsCard repo={p.repo} requests={p.extras.requests} stages={stages} answerable={answerable} />

      <div className="flex flex-col gap-3">
        <RunnerBanner health={runnerHealth} stages={stages} />
        {p.busy && <Banner kind="busy" title={`${p.busy.by} is updating ${p.busy.stageId}`} detail="Other buttons wait until it's done · about 1 min" action={{ label: "Watch", href: `${base}/updating${q}` }} />}
        {p.extras.safetyNetUndid && <Banner kind="undid" title="Safety net undid an update" detail={p.extras.safetyNetUndid} action={{ label: "Why?", href: `${base}/history${q}` }} />}
        {liveSync.length > 0 && <Banner kind="sync" title="Out of sync" detail={`Someone changed ${liveSync.length} file on the ${last.name.toLowerCase()} directly`} action={{ label: "Look", href: `${base}/toolbox${q}#sync` }} />}
        {liveRunning && <Banner kind="sync" title={`${last.name}: ${runningHeadline(liveRunning, p.config.branch)}`} detail={`${runningDetail(liveRunning)}. Putting live from here still needs the usual approval.`} />}
        {p.extras.quietHours && <Banner kind="quiet" title="Quiet hours" detail={p.extras.quietHours} />}
        {p.extras.stagingReady && middle && <Banner kind={p.waiting.length > 0 ? "pending" : "ready"} title={`${middle.name} is ready to look at`} detail={`${p.waiting.length} ${p.waiting.length === 1 ? "change" : "changes"} not on ${last.name.toLowerCase()} yet`} action={{ label: "Open", href: middle.url ?? "#" }} />}
      </div>

      {local && <LocalWorkCard work={local} mainBranch={p.config.branch} />}

      {middle && (
        <RunOverlay repo={p.repo}>
        <Card aria-labelledby="work-title" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="work-title" className="text-2xl font-extrabold">Everyday work</h2>
            {middle.trigger === "auto" && <span className="rounded-full bg-chip px-3.5 py-2 text-[15px] font-bold text-soft">{middle.name} updates by itself when {p.config.branch} changes</span>}
          </div>
          <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_56px_1fr]">
            <div className="flex flex-col gap-1.5 rounded-3xl bg-chip p-5">
              <span className="text-sm font-extrabold tracking-wider text-muted">{p.config.branch.toUpperCase()}</span>
              <span className="text-xl font-extrabold">Your {first.name.toLowerCase()} work</span>
              <span className="text-[15px] text-muted">Latest: {p.waiting[p.waiting.length - 1]?.title ?? "no new changes"}</span>
              {first.url && <ButtonLink href={first.url} className="mt-2.5 min-h-14">Open {first.name.toLowerCase()} site</ButtonLink>}
            </div>
            <div aria-hidden="true" className="flex justify-center text-[#b9c7d6] max-md:rotate-90"><Icon name="arrow" size={40} /></div>
            <StagingCard
              name={middle.name}
              branch={p.config.branch}
              url={middle.url}
              running={midRunning}
              behindBy={st(middle.id)?.behindBy ?? 0}
              commit={st(middle.id)?.commit ?? null}
              deployedAt={st(middle.id)?.deployedAt ?? null}
              pinned={middlePinned}
            />
          </div>
          {middlePinned ? (
            <p className="flex min-h-[72px] items-center justify-center gap-2 rounded-[22px] bg-amber-soft px-5 text-center text-lg font-extrabold text-[#7a4800]">
              <Icon name="lock" /> {middle.name} is pinned, so it won&apos;t update. Unpin it below to update again.
            </p>
          ) : (
            <UpdateStagingButton repo={p.repo} stageId={middle.id} label={`Update ${middle.name.toLowerCase()} from ${p.config.branch}`} />
          )}
        </Card>
        </RunOverlay>
      )}

      <section aria-labelledby="changes-title" className="flex flex-col gap-3">
        <h2 id="changes-title" className="text-xl font-extrabold">
          On {middle?.name.toLowerCase() ?? first.name.toLowerCase()}, not on {last.name.toLowerCase()} yet <span className="text-base font-bold text-muted">· {n} {n === 1 ? "change" : "changes"}</span>
        </h2>
        {n === 0 && <p className="rounded-[22px] bg-white p-6 text-muted">Nothing waiting. {last.name} matches {middle?.name.toLowerCase() ?? "main"}.</p>}
        {p.waiting.map((c, i) => (
          <details key={c.pr || c.commit} open={i === 0} className="rounded-[22px] bg-white shadow-[0_4px_18px_rgba(30,43,58,.06)]">
            <summary className="flex min-h-[72px] items-center gap-3.5 px-5">
              <span className="flex-1 text-lg font-extrabold">{c.title}</span>
              <span className="text-sm font-bold text-muted">{c.pr ? `PR #${c.pr}` : `commit ${c.commit?.slice(0, 7)}`}</span>
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
            {approved && !livePinned ? (
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
          {livePinned
            ? `${last.name} is pinned. Unpin it below before putting changes live.`
            : approved
            ? `Approved by ${p.extras.approval?.by}. Ready to put live.`
            : isOwner
              ? `Unlocks once a code owner approves ${n === 1 ? "this change" : `these ${n} changes`}.`
              : "Only code owners can approve and put changes live. Ask one to review."}
        </p>
        {realRole === "code-owner" && <PreviewToggle base={base} sp={sp} current={isOwner ? "code-owner" : "developer"} />}
      </section>
      </RunOverlay>

      <section aria-labelledby="pin-title" className="flex flex-col gap-3 rounded-[28px] bg-white p-5 shadow-[0_4px_18px_rgba(30,43,58,.06)] sm:p-6">
        <div>
          <h2 id="pin-title" className="text-xl font-extrabold">Pin a version</h2>
          <p className="text-[15px] text-muted">A pinned stage keeps the version it has: no updates and no undos until someone unpins it. {last.name} can only be pinned by a code owner.</p>
        </div>
        <ul className="flex flex-col gap-2.5">
          {pinnable.map((s) => {
            const pinned = !!st(s.id)?.pinned;
            return (
              <li key={s.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-[18px] px-4 py-3 ${pinned ? "bg-amber-soft" : "bg-chip"}`}>
                <span className="flex items-center gap-2.5 font-extrabold">
                  {pinned && <Icon name="lock" className="text-amber" />}
                  {s.name} <span className="font-bold text-muted">· {pinned ? "pinned" : "not pinned"}</span>
                </span>
                {mayPin(s) ? <PinButton repo={p.repo} stageId={s.id} stageName={s.name} pinned={pinned} /> : <span className="text-sm text-muted">Code owners only</span>}
              </li>
            );
          })}
        </ul>
      </section>
    </Page>
  );
}
