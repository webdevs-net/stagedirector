// The one data source the screens use. With GitHub credentials set
// (see .env.example) it reads real projects through src/lib/github; without
// them it serves the built-in demo data from ./mock so the app still runs.
import "server-only";
import * as mock from "./mock";
import * as gh from "./github";
import type { ActivityEvent, ProjectSummary } from "./types";

export type { Viewer, ProjectExtras, ProjectView, RunKind, ActiveRun } from "./mock";
export { RUN_STEPS, repoToSlug } from "./shared";

const live = () => gh.dataSource() === "github";
const slugToRepo = (slug: string) => decodeURIComponent(slug).replace("~", "/");

const NO_EXTRAS: mock.ProjectExtras = {
  starred: false,
  approval: null,
  failedCheck: false,
  safetyNetUndid: null,
  quietHours: null,
  stagingReady: false,
  files: [],
  outOfSyncNote: null,
};

function toView(p: ProjectSummary): mock.ProjectView {
  const staging = p.stages.find((s) => s.stageId === "staging");
  return {
    ...p,
    extras: {
      ...NO_EXTRAS,
      stagingReady: Boolean(staging?.commit) && p.waiting.length > 0,
      outOfSyncNote: p.stages.some((s) => s.outOfSync.length) ? "A file on the server was changed outside git" : null,
    },
  };
}

export async function getViewer(): Promise<mock.Viewer> {
  if (!live()) return mock.getViewer();
  const login = (await gh.currentLogin()) ?? "guest";
  return { login, name: login, role: "viewer" };
}

/** The viewer with their role for one project (roles come from that repo's CODEOWNERS). */
export async function getViewerFor(repo: string): Promise<mock.Viewer> {
  if (!live()) return mock.getViewer();
  const login = await gh.currentLogin();
  const role = await gh.getRoleFor(repo, login);
  return { login: login ?? "guest", name: login ?? "Guest", role };
}

export async function listProjects(): Promise<mock.ProjectView[]> {
  if (!live()) return mock.listProjects();
  const login = await gh.currentLogin();
  return (await gh.getProjects(login)).map(toView);
}

export async function getProject(repoSlug: string): Promise<mock.ProjectView | null> {
  if (!live()) return mock.getProject(repoSlug);
  const login = await gh.currentLogin();
  const p = await gh.getProject(slugToRepo(repoSlug), login);
  return p ? toView(p) : null;
}

export async function getActivity(repoSlug: string): Promise<ActivityEvent[]> {
  if (!live()) return mock.getActivity(repoSlug);
  return gh.getActivity(slugToRepo(repoSlug));
}

export function isDemo(): boolean {
  return !live();
}

/** Technical log for the "updating" page: the newest real run for that stage, or demo lines. */
export async function getRunLog(repoSlug?: string, stageId?: string): Promise<string[]> {
  if (!live()) return mock.getRunLog();
  if (!repoSlug || !stageId) return [];
  const r = await gh.getLatestRunLog(slugToRepo(repoSlug), stageId).catch(() => null);
  return r ? [`Run: ${r.url}`, ...r.lines] : ["No Stage Director run for this stage yet."];
}

// Runs: demo mode uses the in-memory tracker in ./mock. With GitHub connected,
// runs are the real Stage Director workflow runs (polled, ETag-cached).
const KIND: Record<string, mock.RunKind> = { deploy: "update", rollback: "undo", "clear-cache": "clear-cache" };

function fromLive(r: gh.LiveRun): mock.ActiveRun {
  const going = r.state === "running" || r.state === "queued";
  return {
    id: `gh:${r.repo}:${r.stageId}:${r.id}`,
    repo: r.repo,
    projectName: r.projectName,
    stageId: r.stageId,
    stageName: r.stageName,
    stageUrl: r.stageUrl,
    kind: KIND[r.action ?? "deploy"] ?? "update",
    startedAt: Date.parse(r.startedAt),
    step: r.state === "queued" ? 0 : going ? 1 : 2,
    steps: ["Waiting for the runner", "Running on GitHub", "Finished"],
    progress: r.state === "queued" ? 5 : going ? 50 : 100,
    state: r.state === "queued" ? "running" : r.state === "running" ? "running" : r.state === "passed" ? "passed" : r.state === "stopped" ? "stopped" : "failed",
    finishedAt: going ? null : Date.now(),
  };
}

export async function getActiveRuns(): Promise<mock.ActiveRun[]> {
  if (!live()) return mock.getActiveRuns();
  return (await gh.getLiveRuns().catch(() => [])).map(fromLive);
}

export async function stopRun(runId: string): Promise<void> {
  if (!live()) return mock.stopRun(runId);
  const m = /^gh:([^:]+):([^:]*):(\d+)$/.exec(runId);
  const login = await gh.currentLogin();
  if (!m || !login) return;
  await gh.performAction(login, { repo: m[1], stageId: m[2], action: "stop", runId: Number(m[3]) });
}

export async function startRun(repo: string, stageId: string, kind: mock.RunKind): Promise<mock.ActiveRun | { error: string }> {
  if (!live()) return mock.startRun(repo, stageId, kind);
  const login = await gh.currentLogin();
  if (!login) return { error: "Sign in with GitHub first" };
  const action = kind === "undo" ? "rollback" : kind === "clear-cache" ? "clear-cache" : "deploy";
  const r = await gh.performAction(login, { repo, stageId, action });
  if (!r.ok) return { error: r.error };
  const p = await gh.getProject(repo, login);
  const stage = p?.config.stages.find((s) => s.id === stageId);
  // GitHub takes a few seconds to list the new run; show it as queued until then.
  return fromLive({ id: 0, repo, projectName: p?.config.name ?? repo, stageId, stageName: stage?.name ?? stageId, stageUrl: stage?.url, action, state: "queued", startedAt: new Date().toISOString(), url: "" });
}
