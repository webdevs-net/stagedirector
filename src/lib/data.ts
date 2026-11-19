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

export async function getRunLog(): Promise<string[]> {
  // TODO: read the real run log (gh.getRunLog(repo, runId)) once runs carry a GitHub run id.
  return mock.getRunLog();
}

// Runs: the run window and overlay still use the in-memory run tracker.
// In GitHub mode, starting a run also triggers the real workflow through the
// permission-checked performAction; polling real run progress is the next step.
export const getActiveRuns = mock.getActiveRuns;
export const stopRun = mock.stopRun;

export async function startRun(repo: string, stageId: string, kind: mock.RunKind): Promise<mock.ActiveRun | { error: string }> {
  if (live()) {
    const login = await gh.currentLogin();
    if (!login) return { error: "Sign in with GitHub first" };
    const action = kind === "undo" ? "rollback" : kind === "clear-cache" ? "clear-cache" : "deploy";
    const r = await gh.performAction(login, { repo, stageId, action });
    if (!r.ok) return { error: r.error };
  }
  return mock.startRun(repo, stageId, kind);
}
