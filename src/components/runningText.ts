import type { RunningCommit } from "@/lib/types";
import { timeAgo } from "./status";

/** Headline for a stage that runs a commit Stage Director did not deploy. */
export function runningHeadline(r: RunningCommit, branch: string): string {
  const short = r.commit.slice(0, 7);
  if (!r.onBranch) return `Runs ${short} from ${r.ref ?? "another branch"}`;
  return r.behindBy === 0 ? `Runs ${short}, up to date with ${branch}` : `Runs ${short}, ${r.behindBy} behind ${branch}`;
}

export function runningDetail(r: RunningCommit): string {
  const how = r.source === "terminal" ? "deployed from a terminal" : "seen by the version check";
  return `${how}${r.by ? ` by ${r.by}` : ""} · ${timeAgo(r.at)} · not through Stage Director`;
}
