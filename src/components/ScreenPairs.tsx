import type { ScreenSet, Shot } from "@/lib/data";
import { ButtonLink } from "@/components/ui";

const fmt = (iso: string) =>
  iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

/** Live now next to the stage before it, one row per page, from the workflow's screenshots. */
export function ScreenPairs({
  screens,
  slug,
  liveId,
  liveName,
  afterId,
  afterName,
  size,
  sizeHref,
}: {
  screens: ScreenSet | null;
  slug: string;
  liveId: string;
  liveName: string;
  afterId: string;
  afterName: string;
  size: "desktop" | "phone";
  sizeHref: (s: "desktop" | "phone") => string;
}) {
  if (!screens || !screens.shots.some((s) => s.file)) {
    return (
      <div className="rounded-2xl bg-chip p-5 text-muted" data-testid="no-screens">
        No screenshots yet. They are taken after the next update to {afterName.toLowerCase()}.
      </div>
    );
  }
  const src = (s: Shot) => `/api/screens/${encodeURIComponent(slug)}/${screens.id}/${s.file}`;
  const pages = [...new Set(screens.shots.map((s) => s.path))];
  const pick = (stage: string, page: string) => screens.shots.find((s) => s.stage === stage && s.path === page && s.size === size);

  return (
    <div className="flex flex-col gap-4" data-testid="screens">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>
          Taken {fmt(screens.takenAt)}
          {screens.commit ? ` after ${screens.commit.slice(0, 7)} went to ${afterName.toLowerCase()}` : ""}
          {screens.runUrl ? (
            <>
              {" · "}
              <a href={screens.runUrl} target="_blank" rel="noreferrer" className="underline">
                run
              </a>
            </>
          ) : null}
        </span>
        <span className="flex gap-2">
          <ButtonLink href={sizeHref("desktop")} tone={size === "desktop" ? "blue" : "plain"} className="rounded-full">
            Desktop
          </ButtonLink>
          <ButtonLink href={sizeHref("phone")} tone={size === "phone" ? "blue" : "plain"} className="rounded-full">
            Phone
          </ButtonLink>
        </span>
      </div>
      {pages.map((page) => {
        const cells: [string, string, string, Shot | undefined][] = [
          [`${liveName} now`, liveId, "bg-chip", pick(liveId, page)],
          [`After the update (${afterName.toLowerCase()})`, afterId, "bg-teal-soft", pick(afterId, page)],
        ];
        return (
          <section key={page} className="flex flex-col gap-2">
            <h3 className="font-extrabold">{page}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cells.map(([label, , tone, shot]) => (
                <figure key={label} className="flex flex-col gap-2">
                  {shot?.file ? (
                    <a href={src(shot)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-chip">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private, already-small JPEGs from our own API */}
                      <img src={src(shot)} alt={`${label}: ${page}`} loading="lazy" className={`w-full ${size === "phone" ? "mx-auto max-w-[260px]" : ""}`} />
                    </a>
                  ) : (
                    <div className={`flex aspect-[4/3] items-center justify-center rounded-2xl ${tone} p-4 text-center text-muted`}>
                      {shot?.error ? "Could not load this page" : "No picture"}
                      {shot?.status ? ` (answered ${shot.status})` : ""}
                    </div>
                  )}
                  <figcaption className="font-bold">
                    {label}
                    {shot?.status && shot.status >= 400 ? <span className="ml-2 text-amber">answered {shot.status}</span> : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
