// The one data source the screens use. With GitHub credentials set
// (see .env.example) it reads real projects through src/lib/github; without
// them it serves the built-in demo data from ./mock so the app still runs.
import "server-only";
import * as mock from "./mock";
import * as gh from "./github";
import * as runs from "./github/runs";
import type { ActivityEvent, CheckResult, ProjectSummary } from "./types";
import { checksFor, runChecks, summarizeResults } from "./checks";

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

/**
 * The technical log for the Updating screen: the newest run on that stage
 * (GitHub mode), or the built-in sample log.
 */
export async function getRunLog(repoSlug?: string, stageId?: string): Promise<{ lines: string[]; url: string | null; sample: boolean }> {
  if (!live() || !repoSlug || !stageId) return { lines: await mock.getRunLog(), url: null, sample: true };
  const run = await runs.latestRunFor(slugToRepo(repoSlug), stageId);
  if (!run) return { lines: ["No run on this stage yet."], url: null, sample: false };
  const lines = await runs.runLogLines(slugToRepo(repoSlug), run.id);
  return { lines: lines.length ? lines : ["The log is not ready yet. It appears a few seconds after each step."], url: run.url, sample: false };
}

// Runs: in GitHub mode the run window, overlay and Updating screen follow the
// real workflow run (polled through src/lib/github/runs.ts). Without
// credentials they use the 20-second demo run from ./mock.
export async function getActiveRuns(): Promise<mock.ActiveRun[]> {
  return live() ? runs.activeRuns() : mock.getActiveRuns();
}

/** Stops a run. Returns an error message, or null when it was stopped. */
export async function stopRun(runId: string): Promise<string | null> {
  if (!live()) {
    await mock.stopRun(runId);
    return null;
  }
  const login = await gh.currentLogin();
  if (!login) return "Sign in with GitHub first";
  const r = await runs.findRun(runId);
  const id = runs.runIdOf(runId);
  if (!r || !id) return "That run has not started on GitHub yet; try again in a few seconds";
  const res = await gh.performAction(login, { repo: r.repo, stageId: r.stageId, action: "stop", runId: id });
  runs.forgetRuns(r.repo);
  return res.ok ? null : res.error;
}

export async function startRun(repo: string, stageId: string, kind: mock.RunKind): Promise<mock.ActiveRun | { error: string }> {
  if (!live()) return mock.startRun(repo, stageId, kind);
  const login = await gh.currentLogin();
  if (!login) return { error: "Sign in with GitHub first" };
  if ((await runs.activeRuns()).some((r) => r.repo === repo && r.state === "running")) return { error: "Something is already running here" };
  const action = kind === "undo" ? "rollback" : kind === "clear-cache" ? "clear-cache" : "deploy";
  const r = await gh.performAction(login, { repo, stageId, action });
  if (!r.ok) return { error: r.error };
  if (r.recordedAs === "request") return { error: "Saved as a request; a person needs to OK it" };
  return runs.notePending(repo, stageId, kind);
}

/** Pin or unpin a stage. Pinned stages take no updates or undos until unpinned (same rule as the workflow). */
export async function pinStage(repo: string, stageId: string, pin: boolean): Promise<string | null> {
  if (!live()) {
    const viewer = await mock.getViewer();
    return (await mock.pinStage(repo, stageId, pin, viewer.role))?.error ?? null;
  }
  const login = await gh.currentLogin();
  if (!login) return "Sign in with GitHub first";
  const r = await gh.performAction(login, { repo, stageId, action: pin ? "pin" : "unpin" });
  return r.ok ? null : r.error;
}

/**
 * Runs the project's checks on one stage and stores the result as a `check`
 * activity event. `when` = "before" (review step) or "after" (a finished run).
 */
export async function runStageChecks(repoSlug: string, stageId: string, when: "before" | "after"): Promise<{ results: CheckResult[]; error?: string }> {
  const p = await getProject(repoSlug);
  if (!p) return { results: [], error: "No such project" };
  const stage = p.config.stages.find((s) => s.id === stageId);
  if (!stage?.url) return { results: [], error: "This stage has no address to check" };
  const checks = checksFor(p.config, stageId);
  if (!checks.length) return { results: [] };
  const isLast = p.config.stages.at(-1)?.id === stageId;
  let results: CheckResult[];
  let actor: string;
  if (!live()) {
    // Demo: no network. Everything passes unless the sample project is the "failing" one.
    results = checks.map((c) => ({ name: c.name, ok: !p.extras.failedCheck, detail: p.extras.failedCheck ? `${c.pages[0]} answered 500` : `${c.pages.length} ${c.pages.length === 1 ? "page" : "pages"} fine` }));
    actor = (await mock.getViewer()).login;
  } else {
    results = await runChecks(stage.url, checks, isLast);
    actor = (await gh.currentLogin()) ?? "auto";
  }
  const event: Omit<ActivityEvent, "id"> = {
    at: new Date().toISOString(),
    actor,
    action: "check",
    stageId,
    commit: p.stages.find((s) => s.stageId === stageId)?.commit ?? undefined,
    result: results.every((r) => r.ok) ? "passed" : "failed",
    note: summarizeResults(stage.name, results, when),
  };
  await (live() ? gh.recordEvent(p.repo, event) : mock.recordEvent(p.repo, event)).catch(() => undefined);
  return { results };
}
