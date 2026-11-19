import { loadProject, type PageProps } from "@/components/load";
import { RunDetails } from "@/components/runs/RunDetails";
import { BackLink, Chevron, Page } from "@/components/ui";
import { getRunLog } from "@/lib/mock";

export default async function UpdatingPage({ params, searchParams }: PageProps) {
  const { project: p, base, q, sp } = await loadProject(params, searchParams);
  const stageId = typeof sp.stage === "string" ? sp.stage : "staging";
  const stage = p.config.stages.find((s) => s.id === stageId) ?? p.config.stages[1] ?? p.config.stages[0];
  const log = await getRunLog();
  return (
    <Page width="max-w-[640px]">
      <BackLink href={`${base}${q}`} label={p.config.name} />
      <RunDetails repo={p.repo} stageName={stage.name} />
      <details className="rounded-3xl bg-white shadow-[0_6px_24px_rgba(30,43,58,.06)]">
        <summary className="flex min-h-16 items-center justify-between px-6 text-lg font-extrabold"><span>Show the technical log</span><Chevron /></summary>
        <pre className="mx-4 mb-4 overflow-x-auto rounded-2xl bg-ink p-4 font-mono text-[13px] leading-relaxed text-[#e3e4ea]">{log.join("\n")}</pre>
      </details>
    </Page>
  );
}
