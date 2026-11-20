import { ProjectBrowser } from "@/components/ProjectBrowser";
import { Button, ButtonLink, Icon, Page } from "@/components/ui";
import { getViewer, isDemo, listProjects, runnerStatus } from "@/lib/data";
import { RunnerLine } from "@/components/RunnerBanner";

export default async function HomePage() {
  const [viewer, projects] = await Promise.all([getViewer(), listProjects()]);
  const health = await runnerStatus(projects).catch(() => ({}) as Awaited<ReturnType<typeof runnerStatus>>);
  return (
    <Page width="max-w-[1080px]">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m6 10 6 6 6-6" /><path d="M4 21h16" /></svg>
          </div>
          <div>
            <p className="text-base text-muted">Good afternoon, {viewer.name}</p>
            <h1 className="text-[30px] font-extrabold">Your projects <span className="text-lg font-bold text-muted">· {projects.length}</span></h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <ButtonLink href="/activity">Activity record</ButtonLink>
          <Button><Icon name="plus" size={18} /> Add a project</Button>
        </div>
      </header>
      <ProjectBrowser projects={projects} />
      <details>
        <summary className="flex min-h-12 items-center justify-center font-bold text-muted">Engines and servers</summary>
        <div className="flex flex-col gap-1.5 rounded-[20px] bg-white px-5 py-4 text-[15px] text-soft">
          <a href="/usage" className="font-bold text-blue underline">GitHub API usage</a>
          {isDemo() ? (
            <>
              <div>ovh1 runner · running · serves {projects.length} projects (demo)</div>
              <div>Hostinger · reached through ovh1 over SSH (demo)</div>
            </>
          ) : (
            [...new Set(projects.flatMap((p) => p.config.stages.map((s) => s.runner).filter((x): x is string => !!x)))].map((r) => (
              <RunnerLine key={r} h={health[r] ?? { label: r, state: "unknown", names: [] }} usedBy={projects.filter((p) => p.config.stages.some((s) => s.runner === r)).map((p) => p.config.name).join(", ")} />
            ))
          )}
        </div>
      </details>
    </Page>
  );
}
