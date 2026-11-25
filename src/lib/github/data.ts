import "server-only";
import type { Octokit } from "@octokit/rest";
import type { ActivityEvent, Approval, ProjectConfig, ProjectSummary, PushRequest, Role, StageStatus } from "@/lib/types";
import { decide, getRole, approvalValid, type StageAction } from "@/lib/auth";
import { mayAnswer, openRequestsOf } from "@/lib/auth/permissions";
import { configuredRepos, dashboardIsApp, getOctokit, personOctokit, selfLogin, splitRepo } from "./client";
import * as authMod from "@/lib/auth/auth";
import { changesBetween, defaultBranchHead, readConfig, recentRuns, releaseCandidates, resolveRunStage, runFailureReason, startRunRefusal, roleSource, stageStatuses, pinRefExists, startRun, cancelRun, runLog, type RunAction } from "./repo";
import { DeploymentStore, MemoryStore, type EventStore } from "./store";
import { sampleActivity, sampleProjects } from "./sample";
import { invalidate, swr } from "./swr";
import { asCaller } from "./gateway";
import { runnerStateNow } from "./runners";

/** Page reads newer than this are served as is; older ones are served and refreshed behind. */
const FRESH_MS = 20_000;

/** "github" when credentials are set, "sample" when running on built-in sample data. */
export function dataSource(): "github" | "sample" {
  return getOctokit() ? "github" : "sample";
}

let memory: MemoryStore | undefined;
function storeFor(gh: Octokit | null): EventStore {
  if (!gh) return (memory ??= new MemoryStore());
  return new DeploymentStore(
    gh,
    () => selfLogin(gh),
    async (repo) => (await gh.rest.repos.get(splitRepo(repo))).data.default_branch,
  );
}

async function loadConfig(gh: Octokit, repo: string): Promise<ProjectConfig | null> {
  // A missing or invalid file means "no project"; a GitHub error (rate limit, network) throws,
  // so cached reads keep the last good answer instead of showing the project as gone.
  const r = await readConfig(gh, repo);
  return r && r.ok ? r.config : null;
}

async function summarize(gh: Octokit, repo: string, config: ProjectConfig, login: string | null): Promise<ProjectSummary> {
  const store = storeFor(gh);
  const [stages, runs] = await Promise.all([
    stageStatuses(gh, repo, config, (id) => pinRefExists(gh, repo, id).catch(() => store.pinned(repo, id))),
    recentRuns(gh, repo, 10),
  ]);
  const n = stages.length;
  const last = stages[n - 1];
  const prev = n > 1 ? stages[n - 2] : null;
  // Live's base: what was seen running on the server when that is newer than Stage Director's own deploy, else the
  // deploy record. With neither, nothing is known about live (lastKnown null): the page says "not checked", never "matches".
  const lastKnown = last.running ? { commit: last.running.commit, source: "observed" as const }
    : last.commit ? { commit: last.commit, source: "deploy" as const } : null;
  // Live unknown: list staging's latest changes (up to 20) so a code owner can still review, approve and put staging
  // live; the page says live was never checked, so this is not presented as an exact difference.
  const waiting = prev ? await changesBetween(gh, repo, lastKnown?.commit ?? null, prev.commit).catch(() => []) : [];
  const active = runs.find((r) => r.state === "running" || r.state === "queued");
  let needsMe = false;
  if (login && waiting.length && config.stages[n - 1].pushers === "code-owners") {
    const role = await getRole(roleSource(gh), repo, login).catch(() => "viewer" as Role);
    const approval = await store.latestApproval(repo, last.stageId);
    needsMe = role === "code-owner" && !approvalValid(approval, last.stageId, prev?.commit ?? undefined, prev?.commit);
  }
  return {
    repo,
    config,
    stages,
    waiting,
    lastKnown,
    needsMe,
    busy: active ? { by: active.by ?? "someone", stageId: resolveRunStage(config, active.stageId) ?? "" } : null,
  };
}

/** Every configured repo that has a valid stagedirector.yml. `login` drives needsMe. */
export async function getProjects(login: string | null = null, waitMs = 0): Promise<ProjectSummary[]> {
  const gh = getOctokit();
  if (!gh) return sampleProjects;
  const repos = configuredRepos();
  const results = await Promise.all(
    repos.map((repo) => swr(`project:${repo}:${login}`, FRESH_MS, () => getProjectFresh(repo, login), waitMs).catch(() => null)),
  );
  return results.filter((p): p is ProjectSummary => p !== null);
}

/** For page renders: answers at once from the last read, refreshing in the background (src/lib/github/swr.ts). */
export async function getProject(repo: string, login: string | null = null, waitMs = 0): Promise<ProjectSummary | null> {
  if (!getOctokit() || !configuredRepos().includes(repo)) return getProjectFresh(repo, login);
  return swr(`project:${repo}:${login}`, FRESH_MS, () => getProjectFresh(repo, login), waitMs);
}

/** Straight from GitHub. Permission checks use this, never the cached read. */
export async function getProjectFresh(repo: string, login: string | null = null): Promise<ProjectSummary | null> {
  const gh = getOctokit();
  if (!gh) return sampleProjects.find((p) => p.repo === repo) ?? null;
  if (!configuredRepos().includes(repo)) return null;
  const config = await loadConfig(gh, repo);
  return config ? summarize(gh, repo, config, login) : null;
}

/** Newest first: dashboard records (approvals, requests, pins…) merged with workflow runs. */
export async function getActivity(repo: string, limit = 50): Promise<ActivityEvent[]> {
  if (getOctokit() && configuredRepos().includes(repo)) return swr(`activity:${repo}:${limit}`, FRESH_MS, () => getActivityFresh(repo, limit));
  return getActivityFresh(repo, limit);
}

async function getActivityFresh(repo: string, limit: number): Promise<ActivityEvent[]> {
  const gh = getOctokit();
  if (!gh) {
    const extra = await storeFor(null).list(repo, limit);
    return [...extra, ...(sampleActivity[repo] ?? [])].slice(0, limit);
  }
  if (!configuredRepos().includes(repo)) return [];
  const [records, rawRuns, config] = await Promise.all([storeFor(gh).list(repo, limit), recentRuns(gh, repo, limit), loadConfig(gh, repo)]);
  const runs = rawRuns.map((r) => ({ ...r, stageId: config ? resolveRunStage(config, r.stageId) : r.stageId }));
  const fromRuns: ActivityEvent[] = runs.map((r) => ({
    id: `run-${r.id}`,
    at: r.startedAt,
    actor: r.by ?? "auto",
    action: r.action === "rollback" ? "undo" : r.action === "deploy" || !r.action ? "push" : (r.action as ActivityEvent["action"]),
    stageId: r.stageId ?? undefined,
    commit: r.commit ?? undefined,
    result: r.state,
    note: r.url,
    runId: r.id,
  }));
  // Pin/unpin/clear-cache runs are already logged by the dashboard record; keep runs for pushes and undos.
  const runEvents = fromRuns.filter((e) => e.action === "push" || e.action === "undo");
  // Say why the newest failed runs failed (a few, and each run only once: finished runs never change).
  await Promise.all(
    runEvents.filter((e) => e.result === "failed" && e.runId).slice(0, 5).map(async (e) => {
      const why = await runFailureReason(gh, repo, e.runId!).catch(() => null);
      if (why) e.note = why;
    }),
  );
  // A dashboard push/undo record and its workflow run describe the same thing; keep the run (it has the result).
  const key = (e: ActivityEvent) => `${e.action}|${e.stageId}|${e.commit}|${e.actor}`;
  const runKeys = new Set(runEvents.map(key));
  const kept = records.filter((e) => !((e.action === "push" || e.action === "undo") && runKeys.has(key(e))));
  return [...kept, ...runEvents].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export async function getRoleFor(repo: string, login: string | null): Promise<Role> {
  const gh = getOctokit();
  if (!login) return "viewer";
  if (!gh) return process.env.NODE_ENV !== "production" ? "code-owner" : "viewer"; // sample mode: let local dev try every button
  return getRole(roleSource(gh), repo, login);
}

export type ActionInput = {
  repo: string;
  stageId: string;
  action: StageAction;
  commit?: string;
  runId?: number;
  note?: string;
  /** Id of the Claude request this action answers. */
  answers?: string;
};

export type ActionResult =
  | { ok: true; recordedAs: "action" | "request"; event: ActivityEvent }
  | { ok: false; status: number; error: string };

const RUN_ACTIONS: Record<Exclude<StageAction, "approve" | "stop">, RunAction> = {
  deploy: "deploy",
  rollback: "rollback",
  pin: "pin",
  unpin: "unpin",
  "clear-cache": "clear-cache",
  snapshot: "snapshot",
  "copy-live": "copy-live",
};
const EVENT_ACTION: Record<StageAction, ActivityEvent["action"]> = {
  deploy: "push",
  rollback: "undo",
  pin: "pin",
  unpin: "unpin",
  "clear-cache": "clear-cache",
  snapshot: "snapshot",
  "copy-live": "copy-live",
  stop: "stop",
  approve: "approve",
};

/**
 * The one place a button press turns into a GitHub call. Checks permission on
 * the server with fresh data from GitHub; never trusts the browser's view.
 * `actor` is the signed-in login, or "claude:<login>" for a Claude session.
 */
export async function performAction(actor: string, input: ActionInput): Promise<ActionResult> {
  try {
    // Button presses are never held back by the per-minute cap (gateway.ts).
    return await asCaller("action", () => performActionFresh(actor, input));
  } finally {
    invalidate(input.repo); // the next page read shows the result of the press
  }
}

async function performActionFresh(actor: string, input: ActionInput): Promise<ActionResult> {
  const gh = getOctokit();
  const project = await getProjectFresh(input.repo);
  if (!project) return { ok: false, status: 404, error: "unknown project" };
  const { config, stages } = project;
  const idx = config.stages.findIndex((s) => s.id === input.stageId);
  if (idx < 0) return { ok: false, status: 400, error: "unknown stage" };
  const prev: StageStatus | null = idx > 0 ? stages[idx - 1] : null;
  const store = storeFor(gh);
  const person = actor.startsWith("claude:") ? actor.slice(7) : actor;
  const role = await getRoleFor(input.repo, person);
  const approval: Approval | null = await store.latestApproval(input.repo, input.stageId);

  // "Update staging" sends no commit: take what is on the stage before (or the branch head when that is local).
  if (input.action === "deploy" && !input.commit) {
    input = { ...input, commit: prev?.commit ?? (gh ? (await defaultBranchHead(gh, input.repo, config.branch).catch(() => null)) ?? undefined : undefined) };
  }

  if (input.commit && !/^[0-9a-f]{40}$/.test(input.commit)) {
    return { ok: false, status: 400, error: "commit must be a full 40-character SHA" };
  }

  const decision = decide({
    config,
    stageId: input.stageId,
    action: input.action,
    actor,
    role,
    commit: input.commit,
    previousStageCommit: prev?.commit ?? null,
    approval,
    pinned: stages[idx].pinned,
  });
  if (!decision.allowed) return { ok: false, status: 403, error: decision.reason };

  const at = new Date().toISOString();
  const base = { at, actor, stageId: input.stageId, commit: input.commit, note: input.note, ...(input.answers ? { answers: input.answers } : {}) };

  if (decision.recordAs === "request") {
    const event = await store.append(input.repo, {
      ...base,
      action: "request",
      wants: input.action === "stop" ? undefined : input.action,
      commit: input.commit ?? (input.action === "deploy" || input.action === "approve" ? prev?.commit ?? undefined : undefined),
      note: `asks to ${input.action}${input.note ? `: ${input.note}` : ""}`,
    });
    return { ok: true, recordedAs: "request", event };
  }

  // GitHub must see the person for code-owner stages (the engine checks who made the approval
  // and who started the run). Use their own token; the dashboard's identity only when it is
  // itself a person's token (local testing).
  const codeOwnerStage = config.stages[idx].pushers === "code-owners";
  const personToken = codeOwnerStage ? await (authMod.currentGithubToken?.() ?? null) : null;
  const asPerson = personToken ? personOctokit(personToken) : !dashboardIsApp() ? gh : null;
  if (codeOwnerStage && !asPerson && gh && (input.action === "approve" || input.action === "deploy" || input.action === "rollback")) {
    return { ok: false, status: 401, error: `Sign out and in again so Stage Director can act as you on ${config.stages[idx].name} (GitHub only accepts it from you, not from the dashboard)` };
  }

  if (input.action === "approve") {
    const a: Approval = { commit: input.commit!, stageId: input.stageId, by: actor, at };
    // The record the engine's live gate checks (engine/contract.md): a commit status made by the code owner.
    if (asPerson) {
      await asPerson.rest.repos.createCommitStatus({
        ...splitRepo(input.repo), sha: input.commit!, state: "success",
        context: `stagedirector/approval/${input.stageId}`, description: `Approved in Stage Director by ${actor}`.slice(0, 140),
      });
    }
    const event = await store.append(input.repo, { ...base, action: "approve" }, a);
    return { ok: true, recordedAs: "action", event };
  }

  if (input.action === "stop") {
    if (!gh) return { ok: false, status: 503, error: "GitHub is not connected" };
    const runs = await recentRuns(gh, input.repo, 20);
    const run = input.runId
      ? runs.find((r) => r.id === input.runId)
      : runs.find((r) => (r.state === "running" || r.state === "queued") && r.stageId === input.stageId);
    if (!run || run.stageId !== input.stageId) return { ok: false, status: 404, error: "no running push on that stage" };
    await cancelRun(gh, input.repo, run.id);
    const event = await store.append(input.repo, { ...base, action: "stop", commit: run.commit ?? undefined, runId: run.id });
    return { ok: true, recordedAs: "action", event };
  }

  if (!gh) return { ok: false, status: 503, error: "GitHub is not connected (sample mode)" };
  let commit = input.commit ?? stages[idx].commit;
  // A backup or a cache clear does not move code, so it needs no record of what is on the stage:
  // the workflow only wants a commit to check out its scripts. Use the source branch's tip.
  if (!commit && (input.action === "snapshot" || input.action === "clear-cache" || input.action === "copy-live")) {
    commit = (await gh.rest.repos.getBranch({ ...splitRepo(input.repo), branch: config.branch })).data.commit.sha;
  }
  if (!commit) return { ok: false, status: 400, error: "nothing on that stage yet" };
  // Don't queue a run that can never start: refuse when the stage's runner is known offline.
  // "unknown" (GitHub won't tell us) is allowed.
  const runnerLabel = config.stages[idx].runner;
  if (runnerLabel && (await runnerStateNow(gh, input.repo, runnerLabel)) === "offline") {
    return { ok: false, status: 409, error: `The runner on ${runnerLabel} is offline, so nothing can run on ${config.stages[idx].name} right now. Nothing was started. Try again once it is back.` };
  }
  try {
    await startRun(codeOwnerStage && asPerson ? asPerson : gh, input.repo, config.branch, {
      stage: input.stageId,
      commit,
      action: RUN_ACTIONS[input.action as keyof typeof RUN_ACTIONS],
      requestedBy: actor,
      // Local Actions by default; projects opt into GitHub-hosted with gateRunner: github.
      gateRunner: config.gateRunner ?? "self-hosted",
    });
  } catch (e) {
    const why = startRunRefusal(e, input.repo, config.branch);
    if (why) return { ok: false, ...why };
    throw e;
  }
  const event = await store.append(input.repo, { ...base, commit, action: EVENT_ACTION[input.action], result: "queued" });
  return { ok: true, recordedAs: "action", event };
}

/** App projects: release tags on the branch that the first deployable stage can be built from (newest first). */
export async function getReleaseCandidates(repo: string, branch: string) {
  const gh = getOctokit();
  if (!gh || !configuredRepos().includes(repo)) return [];
  return releaseCandidates(gh, repo, branch);
}

export async function getRunLog(repo: string, runId: number): Promise<string | null> {
  const gh = getOctokit();
  if (!gh || !configuredRepos().includes(repo)) return null;
  return runLog(gh, repo, runId);
}

/** Records a dashboard event (e.g. check results) in the project's activity log. */
export async function recordEvent(repo: string, event: Omit<ActivityEvent, "id">): Promise<ActivityEvent> {
  return storeFor(getOctokit()).append(repo, event);
}

/** Requests from Claude sessions that no person has answered yet. */
export async function openRequests(repo: string): Promise<PushRequest[]> {
  const events = await storeFor(getOctokit()).list(repo, 100);
  return openRequestsOf(events).map((e) => ({ id: e.id, at: e.at, actor: e.actor, stageId: e.stageId!, wants: e.wants!, commit: e.commit, note: e.note }));
}

/**
 * A person answers a Claude request. OK runs the asked action as that person
 * (for a code-owner stage deploy: approval of that exact commit, then the push),
 * with every normal permission check. Decline records a "decline". An actor
 * starting "claude:" can never answer.
 */
export async function answerRequest(actor: string, repo: string, requestId: string, ok: boolean): Promise<ActionResult> {
  return asCaller("action", () => answerRequestFresh(actor, repo, requestId, ok));
}

async function answerRequestFresh(actor: string, repo: string, requestId: string, ok: boolean): Promise<ActionResult> {
  const project = await getProjectFresh(repo);
  if (!project) return { ok: false, status: 404, error: "unknown project" };
  const req = (await openRequests(repo)).find((r) => r.id === requestId);
  if (!req) return { ok: false, status: 404, error: "that request is already answered or gone" };
  const role = await getRoleFor(repo, actor.startsWith("claude:") ? actor.slice(7) : actor);
  const may = mayAnswer(project.config, req.stageId, actor, role);
  if (!may.ok) return { ok: false, status: 403, error: may.reason };
  if (!ok) {
    const event = await storeFor(getOctokit()).append(repo, {
      at: new Date().toISOString(), actor, action: "decline", stageId: req.stageId, commit: req.commit, answers: req.id, note: `declined ${req.actor.slice(7)}'s Claude request to ${req.wants}`,
    });
    return { ok: true, recordedAs: "action", event };
  }
  const stage = project.config.stages.find((s) => s.id === req.stageId)!;
  if (stage.pushers === "code-owners" && req.wants === "deploy") {
    if (!req.commit) return { ok: false, status: 400, error: "the request names no commit" };
    const a = await performAction(actor, { repo, stageId: req.stageId, action: "approve", commit: req.commit, answers: req.id, note: `OK for ${req.actor}'s request` });
    if (!a.ok) return a;
  }
  return performAction(actor, { repo, stageId: req.stageId, action: req.wants, commit: req.commit, answers: req.id, note: `asked by ${req.actor}` });
}

/** The valid approval for putting what is on the stage before onto the last stage, if any. */
export async function currentApproval(repo: string, opts: { cached?: boolean; waitMs?: number } = {}): Promise<Approval | null> {
  if (opts.cached) return swr(`approval:${repo}`, FRESH_MS, () => currentApproval(repo), opts.waitMs);
  const project = await getProjectFresh(repo);
  if (!project || project.stages.length < 2) return null;
  const last = project.stages[project.stages.length - 1];
  const prev = project.stages[project.stages.length - 2];
  const a = await storeFor(getOctokit()).latestApproval(repo, last.stageId);
  return approvalValid(a, last.stageId, prev.commit ?? undefined, prev.commit) ? a : null;
}
