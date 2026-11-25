import { ProjectNav } from "@/components/ProjectNav";
import { loadProject, type PageProps } from "@/components/load";
import { ButtonLink, Card, Eyebrow, Icon, Page } from "@/components/ui";
import { inquireStages } from "@/lib/inquiry";
import { localPaths, onLocalhost } from "@/lib/local/git";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function InquirePage({ params, searchParams }: PageProps) {
  const { project: p, base, q } = await loadProject(params, searchParams);
  const rows = await inquireStages(p.repo, p.config);
  const local = await onLocalhost();
  const mapped = local ? localPaths() : {};
  const allLocal = Object.entries(mapped);

  return (
    <Page width="max-w-[960px]">
      <ProjectNav name={p.config.name} base={base} q={q} active="inquire" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Inquire</h1>
          <p className="text-[17px] text-muted">Ask each stage how it is — open it, see if it answers, and where the local checkout lives.</p>
        </div>
        <ButtonLink href={`${base}/inquire${q}`} tone="teal" className="min-h-12">
          <Icon name="refresh" size={18} /> Inquire again
        </ButtonLink>
      </header>

      <section aria-labelledby="stages-title" className="flex flex-col gap-3">
        <Eyebrow><span id="stages-title">STAGES</span></Eyebrow>
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <Card key={r.stageId} className="flex flex-wrap items-center gap-4 !p-5">
              <div className="min-w-[200px] flex-1">
                <h2 className="text-xl font-extrabold">{r.name}</h2>
                <p className="break-all text-[15px] text-muted">{r.url ?? "No public URL"}</p>
                {r.runner && <p className="mt-1 text-sm font-bold text-soft">Runner · {r.runner}</p>}
                {r.localPath && (
                  <p className={`mt-1 text-sm font-bold ${r.localPathExists ? "text-[#0f6f6b]" : "text-amber"}`}>
                    Local · {r.localPath}
                    {!r.localPathExists ? " (missing)" : ""}
                  </p>
                )}
              </div>
              <div className="flex min-w-[160px] flex-col items-end gap-2">
                <StatusPill reachable={r.reachable} detail={r.detail} />
                {r.url && (
                  <ButtonLink href={r.url} tone="white" className="min-h-12 px-4">
                    Open {r.name.toLowerCase()}
                  </ButtonLink>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {local && (
        <section aria-labelledby="local-title" className="flex flex-col gap-3">
          <Eyebrow><span id="local-title">LOCAL ITEMS ON THIS MACHINE</span></Eyebrow>
          <Card className="!p-5">
            {allLocal.length === 0 ? (
              <p className="text-[15px] text-muted">
                No checkouts mapped yet. Add paths in <code className="font-bold">stagedirector.local.json</code> (see{" "}
                <code className="font-bold">stagedirector.local.example.json</code>) or set{" "}
                <code className="font-bold">STAGEDIRECTOR_LOCAL_PATHS</code>.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {allLocal.map(([repo, path]) => (
                  <li key={repo} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-chip pt-2 first:border-0 first:pt-0">
                    <span className="font-extrabold">{repo}</span>
                    <span className="break-all text-[15px] text-muted">{path}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm text-muted">
              Live dashboard with real GitHub data: <code className="font-bold">npm run dev:live</code> →{" "}
              <Link href="http://localhost:53100" className="font-bold text-blue underline">http://localhost:53100</Link>
            </p>
          </Card>
        </section>
      )}
    </Page>
  );
}

function StatusPill({ reachable, detail }: { reachable: boolean | null; detail: string }) {
  const tone =
    reachable === true ? "bg-[#dff5f3] text-[#0f6f6b]" : reachable === false ? "bg-amber-soft text-[#7a4800]" : "bg-chip text-muted";
  const label = reachable === true ? "Reached" : reachable === false ? "No answer" : "No URL";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-extrabold ${tone}`}>
      {reachable === true ? <Icon name="check" size={14} /> : reachable === false ? <Icon name="alert" size={14} /> : <Icon name="globe" size={14} />}
      {label}
      <span className="font-bold opacity-80">· {detail}</span>
    </span>
  );
}
