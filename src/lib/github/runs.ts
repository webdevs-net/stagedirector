import "server-only";
import type { Octokit } from "@octokit/rest";
import type { ActiveRun, RunKind } from "@/lib/mock";
import type { ProjectConfig } from "@/lib/types";
import { configuredRepos, getOctokit, splitRepo } from "./client";
import { mapProgress, type GhJob } from "./progress";
import { localRuns } from "./runprogress";
import { readConfig, recentRuns, resolveRunStage, runLog, type RunInfo } from "./repo";

// Live run progress from GitHub Actions. The browser polls every second while
// something runs; answers are cached for a few seconds per repo so GitHub's
// rate limit is not hit (5000 calls/hour for an App installation).

const RUN_TTL = 3_000;
const CONFIG_TTL = 60_000;
const KEEP_FINISHED = 60_000;

const g = globalThis as unknown as {
  __sdGhRuns?: Map<string, { at: number; runs: ActiveRun[] }>;
  __sdGhConfig?: Map<string, { at: number; config: ProjectConfig | null }>;
  __sdPending?: Map<string, ActiveRun & { dispatchedAt: number }>;
};
const runCache = (g.__sdGhRuns ??= new Map());
const configCache = (g.__sdGhConfig ??= new Map());
/** Runs we dispatched that GitHub has not listed yet (dispatch returns no run id). */
const pending = (g.__sdPending ??= new Map());

export const runIdOf = (id: string): number | null => {
  const m = /^gh-(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
};

async function configOf(gh: Octokit, repo: string): Promise<ProjectConfig | null> {
  const hit = configCache.get(repo);
  if (hit && Date.now() - hit.at < CONFIG_TTL) return hit.config;
  const r = await readConfig(gh, repo).catch(() => null);
  const config = r && r.ok ? r.config : null;
  configCache.set(repo, { at: Date.now(), config });
  return config;
}

function kindOf(action: string | null, config: ProjectConfig, stageId: string): RunKind | null {
  if (action === "rollback") return "undo";
  if (action === "clear-cache") return "clear-cache";
  if (action === "deploy" || action === null) return config.stages.at(-1)?.id === stageId ? "put-live" : "update";
  return null; // pin/unpin are instant; no run window for them
}

async function jobsOf(gh: Octokit, repo: string, runId: number): Promise<GhJob[]> {
  const { data } = await gh.rest.actions.listJobsForWorkflowRun({ ...splitRepo(repo), run_id: runId, filter: "latest" });
  return data.jobs.map((j) => ({
    name: j.name,
    status: j.status,
    conclusion: j.conclusion,
    steps: (j.steps ?? []).map((s) => ({ name: s.name, status: s.status, conclusion: s.conclusion })),
  }));
}

export function toActiveRun(r: RunInfo, config: ProjectConfig, repo: string, jobs: GhJob[] | null, finishedAt: number | null): ActiveRun | null {
  const stageId = resolveRunStage(config, r.stageId);
  const stage = config.stages.find((s) => s.id === stageId);
  if (!stage) return null;
  const kind = kindOf(r.action, config, stage.id);
  if (!kind) return null;
  const steps = kind === "clear-cache" ? ["Clearing cache", "Making sure the site still loads"] : undefined;
  const p = mapProgress(jobs ?? [], steps);
  const running = r.state === "running" || r.state === "queued";
  const state: ActiveRun["state"] = running ? "running" : r.state === "passed" ? "passed" : r.state === "stopped" ? "stopped" : "failed";
  return {
    id: `gh-${r.id}`,
    repo,
    projectName: config.name,
    stageId: stage.id,
    stageName: stage.name,
    stageUrl: stage.url,
    kind,
    startedAt: Date.parse(r.startedAt),
    step: running ? Math.min(p.step, p.steps.length - 1) : p.steps.length - 1,
    steps: p.steps,
    progress: running ? p.progress : 100,
    state,
    finishedAt: running ? null : finishedAt ?? Date.now(),
    runId: r.id,
    url: r.url,
  };
}

async function runsFor(gh: Octokit, repo: string): Promise<ActiveRun[]> {
  const hit = runCache.get(repo);
  if (hit && Date.now() - hit.at < RUN_TTL) return hit.runs;
  const config = await configOf(gh, repo);
  if (!config) return [];
  // A runner on this machine writes progress to a local file: while a run is going,
  // follow it from there with no API calls. GitHub is asked again once it ends.
  const local = localRuns(repo);
  if (local?.some((r) => r.state === "running" && Date.now() - Date.parse(r.updatedAt ?? r.startedAt) < 30 * 60_000)) {
    const out: ActiveRun[] = [];
    for (const r of local) {
      const running = r.state === "running";
      const finishedAt = running ? null : Date.parse(r.updatedAt ?? r.startedAt);
      if (!running && Date.now() - (finishedAt ?? 0) > KEEP_FINISHED) continue;
      const a = toActiveRun(r, config, repo, null, finishedAt);
      if (!a) continue;
      if (running) {
        a.step = Math.min(r.step, a.steps.length - 1);
        a.progress = Math.round(((a.step + 0.5) / a.steps.length) * 100);
      }
      out.push(a);
    }
    runCache.set(repo, { at: Date.now(), runs: out });
    return out;
  }
  const recent = await recentRuns(gh, repo, 5).catch(() => [] as RunInfo[]);
  const out: ActiveRun[] = [];
  for (const r of recent) {
    const running = r.state === "running" || r.state === "queued";
    const finishedAt = running ? null : Date.parse(r.updatedAt ?? r.startedAt);
    if (!running && Date.now() - (finishedAt ?? 0) > KEEP_FINISHED) continue;
    const jobs = running ? await jobsOf(gh, repo, r.id).catch(() => null) : null;
    const a = toActiveRun(r, config, repo, jobs, finishedAt);
    if (a) out.push(a);
  }
  runCache.set(repo, { at: Date.now(), runs: out });
  return out;
}

/** Runs going now (or finished in the last minute) across every configured repo. */
export async function activeRuns(): Promise<ActiveRun[]> {
  const gh = getOctokit();
  if (!gh) return [];
  const lists = await Promise.all(configuredRepos().map((repo) => runsFor(gh, repo).catch(() => [])));
  const real = lists.flat();
  // Drop a placeholder once GitHub lists a run for the same stage started after the dispatch.
  for (const [id, p] of pending) {
    const found = real.some((r) => r.repo === p.repo && r.stageId === p.stageId && r.startedAt >= p.dispatchedAt - 5_000);
    if (found || Date.now() - p.dispatchedAt > 90_000) pending.delete(id);
  }
  return [...real, ...pending.values()];
}

/** Shows a "starting" run right away after a dispatch, until GitHub lists the real one. */
export async function notePending(repo: string, stageId: string, kind: RunKind): Promise<ActiveRun | { error: string }> {
  const gh = getOctokit();
  const config = gh ? await configOf(gh, repo) : null;
  const stage = config?.stages.find((s) => s.id === stageId);
  if (!config || !stage) return { error: "No such project" };
  runCache.delete(repo);
  const now = Date.now();
  const run: ActiveRun & { dispatchedAt: number } = {
    id: `pending-${now}`,
    repo,
    projectName: config.name,
    stageId,
    stageName: stage.name,
    stageUrl: stage.url,
    kind,
    startedAt: now,
    step: 0,
    steps: mapProgress([]).steps,
    progress: 1,
    state: "running",
    finishedAt: null,
    dispatchedAt: now,
  };
  pending.set(run.id, run);
  return run;
}

export function forgetRuns(repo: string) {
  runCache.delete(repo);
}

/** The run with this id, if it is one we know about. */
export async function findRun(id: string): Promise<ActiveRun | null> {
  return (await activeRuns()).find((r) => r.id === id) ?? null;
}

/** The newest run on a stage (for the Updating screen's log). */
export async function latestRunFor(repo: string, stageId: string): Promise<RunInfo | null> {
  const gh = getOctokit();
  if (!gh) return null;
  const recent = await recentRuns(gh, repo, 10).catch(() => []);
  return recent.find((r) => r.stageId === stageId && r.action !== "pin" && r.action !== "unpin") ?? null;
}

/** Last `max` lines of a run's log, without GitHub's timestamps. */
export async function runLogLines(repo: string, runId: number, max = 300): Promise<string[]> {
  const gh = getOctokit();
  if (!gh) return [];
  const text = await runLog(gh, repo, runId).catch(() => "");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/, ""))
    .filter((l) => l && !l.startsWith("##[debug]"));
  return lines.slice(-max);
}
