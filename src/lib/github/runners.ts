import "server-only";
import type { Octokit } from "@octokit/rest";
import type { GhJob } from "./progress";
import { getOctokit, splitRepo } from "./client";
import { swr } from "./swr";

// Health of the self-hosted runners a project's stages need (stagedirector.yml
// `runner:` labels, e.g. "ovh1"). Read from GET /repos/{owner}/{repo}/actions/runners.
// That endpoint needs Administration: read; without it GitHub answers 403/404 and
// every runner is "unknown". Nothing here ever throws to a page.

export type RunnerState = "online" | "offline" | "busy" | "unknown";

export interface RunnerHealth {
  label: string;
  state: RunnerState;
  /** Names of the registered runners carrying this label. */
  names: string[];
  /** When the dashboard first saw this label offline (ISO), if it is offline. */
  offlineSince?: string | null;
}

/** The parts of a GitHub runner this file reads. */
export interface GhRunner {
  name: string;
  status: string; // "online" | "offline"
  busy: boolean;
  labels: { name: string }[];
}

const RUNNERS_TTL = 60_000;

const g = globalThis as unknown as { __sdOfflineSince?: Map<string, string> };
const offlineSince = (g.__sdOfflineSince ??= new Map());

/**
 * Pure: the state of each label given the repo's runners (null = could not read them).
 * Online when any runner with the label is online and idle; busy when all online ones
 * are busy; offline when every runner with the label is offline or none has it.
 */
export function classifyRunners(runners: GhRunner[] | null, labels: string[]): Record<string, RunnerHealth> {
  const out: Record<string, RunnerHealth> = {};
  for (const label of labels) {
    if (!runners) {
      out[label] = { label, state: "unknown", names: [] };
      continue;
    }
    const mine = runners.filter((r) => r.labels.some((l) => l.name.toLowerCase() === label.toLowerCase()));
    const online = mine.filter((r) => r.status === "online");
    const state: RunnerState = online.some((r) => !r.busy) ? "online" : online.length ? "busy" : "offline";
    out[label] = { label, state, names: mine.map((r) => r.name) };
  }
  return out;
}

/** The repo's runners, or null when GitHub will not tell us (403/404, no access). Never throws. */
export async function fetchRunners(gh: Octokit, repo: string): Promise<GhRunner[] | null> {
  try {
    const { data } = await gh.rest.actions.listSelfHostedRunnersForRepo({ ...splitRepo(repo), per_page: 100 });
    return data.runners.map((r) => ({ name: r.name, status: r.status, busy: r.busy, labels: r.labels.map((l) => ({ name: l.name })) }));
  } catch {
    return null;
  }
}

function stampOffline(repo: string, health: Record<string, RunnerHealth>, now = Date.now()) {
  for (const h of Object.values(health)) {
    const key = `${repo}|${h.label}`;
    if (h.state === "offline") {
      if (!offlineSince.has(key)) offlineSince.set(key, new Date(now).toISOString());
      h.offlineSince = offlineSince.get(key) ?? null;
    } else if (h.state !== "unknown") {
      offlineSince.delete(key);
    }
  }
  return health;
}

/** Runner health for one repo's labels, cached about a minute. Sample mode: every runner online. */
export async function runnerHealth(repo: string, labels: string[]): Promise<Record<string, RunnerHealth>> {
  const uniq = [...new Set(labels.filter(Boolean))];
  if (!uniq.length) return {};
  const gh = getOctokit();
  if (!gh) return Object.fromEntries(uniq.map((l) => [l, { label: l, state: "online" as const, names: [`${l}-runner`] }]));
  try {
    const runners = await swr(`runners:${repo}`, RUNNERS_TTL, () => fetchRunners(gh, repo));
    return stampOffline(repo, classifyRunners(runners, uniq));
  } catch {
    return classifyRunners(null, uniq);
  }
}

/** Fresh (uncached) health of one label, for the check before a run starts. Never throws. */
export async function runnerStateNow(gh: Octokit, repo: string, label: string | undefined): Promise<RunnerState> {
  if (!label) return "unknown";
  const runners = await fetchRunners(gh, repo);
  return stampOffline(repo, classifyRunners(runners, [label]))[label].state;
}

/** How long a run may sit without any job starting before we call it stuck. */
export const STUCK_MS = 3 * 60_000;

/**
 * Pure: a run is waiting for a runner when it has been going more than `STUCK_MS`
 * and no job is doing anything yet: the run is queued, or a job is queued and none is in progress.
 */
export function waitingForRunner(state: string, startedAt: number, jobs: GhJob[] | null, now = Date.now(), stuckMs = STUCK_MS): boolean {
  if (now - startedAt < stuckMs) return false;
  if (state === "queued") return true;
  if (state !== "running" || !jobs) return false;
  const inProgress = jobs.some((j) => j.status === "in_progress" && (j.steps ?? []).some((s) => s.status !== "queued"));
  return !inProgress && jobs.some((j) => j.status === "queued" || j.status === "waiting" || j.status === "pending");
}
