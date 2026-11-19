import { loadProject, type PageProps } from "@/components/load";
import { RunDetails } from "@/components/runs/RunDetails";
import { RunLog } from "@/components/runs/RunLog";
import { BackLink, Page } from "@/components/ui";
import { getRunLog } from "@/lib/data";

export default async function UpdatingPage({ params, searchParams }: PageProps) {
  const { project: p, base, q, sp } = await loadProject(params, searchParams);
  const stageId = typeof sp.stage === "string" ? sp.stage : "staging";
  const stage = p.config.stages.find((s) => s.id === stageId) ?? p.config.stages[1] ?? p.config.stages[0];
  const slug = decodeURIComponent((await params).repo);
  const log = await getRunLog(slug, stage.id);
  return (
    <Page width="max-w-[640px]">
      <BackLink href={`${base}${q}`} label={p.config.name} />
      <RunDetails repo={p.repo} stageId={stage.id} stageName={stage.name} demo={log.sample} />
      <RunLog repo={p.repo} repoSlug={slug} stageId={stage.id} initial={log} />
    </Page>
  );
}
