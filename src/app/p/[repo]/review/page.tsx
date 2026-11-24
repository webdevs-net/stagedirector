import { ActionButton } from "@/components/ActionButton";
import { loadProject, type PageProps } from "@/components/load";
import { BackLink, ButtonLink, Card, Icon, Page } from "@/components/ui";
import { CheckPanel } from "@/components/CheckPanel";
import { ScreenPairs } from "@/components/ScreenPairs";
import { getScreens } from "@/lib/data";
import { wording } from "@/lib/wording";

export default async function ReviewPage({ params, searchParams }: PageProps) {
  const { project: p, viewer, base, q, sp } = await loadProject(params, searchParams);
  const idx = Math.min(Number(sp.i ?? 0) || 0, Math.max(p.waiting.length - 1, 0));
  const c = p.waiting[idx];
  const last = p.config.stages[p.config.stages.length - 1];
  const commit = p.stages[p.stages.length - 2]?.commit ?? "";
  const isOwner = viewer.role === "code-owner";
  const before = p.config.stages[p.config.stages.length - 2];
  const slug = decodeURIComponent((await params).repo);
  const size = sp.size === "phone" ? "phone" : "desktop";
  const w = wording(p.config);
  // An app has no pages to photograph: its review is the list of changes.
  const screens = before && w.siteTools ? await getScreens(slug, before.id) : null;

  return (
    <Page width="max-w-[860px]">
      <BackLink href={`${base}${q}`} label={p.config.name} />
      <h1 className="text-3xl font-extrabold">{w.reviewTitle}</h1>
      {!c ? (
        <p className="rounded-[22px] bg-white p-6 text-muted">Nothing is waiting for {last.name.toLowerCase()}.</p>
      ) : (
        <Card aria-labelledby="ba-title" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="ba-title" className="text-xl font-extrabold">{w.siteTools ? <>Before &amp; after</> : "What changes"}</h2>
            <span className="font-bold text-muted">{c.title} · {idx + 1} of {p.waiting.length}</span>
          </div>
          {w.siteTools && <ScreenPairs
            screens={screens}
            slug={slug}
            liveId={last.id}
            liveName={last.name}
            afterId={before?.id ?? ""}
            afterName={before?.name ?? "Staging"}
            size={size}
            sizeHref={(s) => `${base}/review?i=${idx}${s === "phone" ? "&size=phone" : ""}${q ? "&as=developer" : ""}`}
          />}
          <p className="text-soft">{c.summary}</p>
          <nav aria-label="Changes" className="flex flex-wrap gap-2">
            {p.waiting.map((w, i) => (
              <ButtonLink key={w.pr || w.commit} href={`${base}/review?i=${i}${q ? "&as=developer" : ""}`} tone={i === idx ? "blue" : "plain"} className="rounded-full">
                {i + 1}
              </ButtonLink>
            ))}
          </nav>
        </Card>
      )}

      {c && before?.url && <CheckPanel repoSlug={slug} stageId={before.id} stageName={before.name} when="before" auto />}

      {p.config.liveTodo && p.config.liveTodo.length > 0 && (
        <Card aria-labelledby="todo-title" className="flex flex-col gap-3">
          <h2 id="todo-title" className="text-xl font-extrabold">{w.todoTitle}</h2>
          <ul className="flex flex-col gap-2">
            {p.config.liveTodo.map((t) => (
              <li key={t}>
                <label className="flex min-h-[52px] items-center gap-3 rounded-2xl bg-chip px-4">
                  <input type="checkbox" className="h-6 w-6 accent-[#0f8f8a]" /> {t}
                </label>
              </li>
            ))}
            {p.config.tools?.clearCache && (
              <li className="flex min-h-[52px] items-center gap-3 rounded-2xl bg-teal-soft px-4 text-teal-ink">
                <Icon name="check" /> Clear cache (done for you)
              </li>
            )}
          </ul>
        </Card>
      )}

      {c && (isOwner ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ActionButton act="approve" repo={p.repo} arg={commit} next={`${base}/live?approved=1`} className="min-h-16 bg-blue text-[19px] text-white">
            Looks good, approve
          </ActionButton>
          <ButtonLink href={`${base}${q}`} tone="amber" className="min-h-16 text-[19px]">Something&apos;s off</ButtonLink>
        </div>
      ) : (
        <p className="rounded-2xl bg-blue-soft p-4 text-center font-bold text-[#1f4f94]">Only a code owner can approve. Ask a code owner to look at this.</p>
      ))}
    </Page>
  );
}
