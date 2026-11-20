import type { RunningCommit } from "@/lib/types";
import { runningDetail, runningHeadline } from "./runningText";
import { timeAgo } from "./status";
import { ButtonLink } from "./ui";

/**
 * The middle-stage card in "Everyday work". Its colour follows its state:
 * green = matches main (nothing to do), amber = behind main or pinned,
 * blue = something else is running on it right now.
 */
export function StagingCard({ name, branch, url, running, behindBy, commit, deployedAt, pinned = false }: {
  name: string;
  branch: string;
  url?: string | null;
  running: RunningCommit | null;
  behindBy: number;
  commit: string | null;
  deployedAt: string | null;
  pinned?: boolean;
}) {
  const never = !running && !commit;
  const tone = running ? "busy" : never || behindBy > 0 || pinned ? "behind" : "ok";
  const t = {
    ok: { bg: "bg-teal-soft", eyebrow: "text-[#0f6f6b]", ink: "text-teal-ink" },
    behind: { bg: "bg-amber-soft", eyebrow: "text-[#7a4800]", ink: "text-[#7a4800]" },
    busy: { bg: "bg-blue-soft", eyebrow: "text-[#1f4f94]", ink: "text-[#1f4f94]" },
  }[tone];
  return (
    <div className={`flex flex-col gap-1.5 rounded-3xl p-5 ${t.bg}`}>
      <span className={`text-sm font-extrabold tracking-wider ${t.eyebrow}`}>{name.toUpperCase()}</span>
      {running ? (
        <>
          <span className="text-xl font-extrabold">{runningHeadline(running, branch)}</span>
          <span className={`text-[15px] ${t.ink}`}>{runningDetail(running)}</span>
          <span className="text-sm text-muted">Last push through Stage Director: {commit?.slice(0, 7) ?? "none"} · {timeAgo(deployedAt)}</span>
        </>
      ) : (
        <>
          <span className="text-xl font-extrabold">{never ? "Not deployed yet" : behindBy === 0 ? `Up to date with ${branch}` : `${behindBy} behind ${branch}`}</span>
          <span className={`text-[15px] ${t.ink}`}>{never ? "No update has finished here through Stage Director" : `Updated ${timeAgo(deployedAt)}`}</span>
        </>
      )}
      {url && <ButtonLink href={url} className={`mt-2.5 min-h-14 ${t.ink}`}>Open {name.toLowerCase()}</ButtonLink>}
    </div>
  );
}
