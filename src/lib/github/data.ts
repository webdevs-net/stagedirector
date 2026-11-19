import "server-only";
import type { Octokit } from "@octokit/rest";
import type { ActivityEvent, Approval, ProjectConfig, ProjectSummary, Role, StageStatus } from "@/lib/types";
import { decide, getRole, approvalValid, type StageAction } from "@/lib/auth";
import { configuredRepos, getOctokit, selfLogin, splitRepo } from "./client";
import { changesBetween, readConfig, recentRuns, roleSource, stageStatuses, startRun, cancelRun, runLog, type RunAction } from "./repo";
import { DeploymentStore, MemoryStore, type EventStore } from "./store";
import { sampleActivity, sampleProjects } from "./sample";

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
  const r = await readConfig(gh, repo).catch(() => null);
  return r && r.ok ? r.config : null;
}

async function summarize(gh: Octokit, repo: string, config: ProjectConfig, login: string | null): Promise<ProjectSummary> {
  const store = storeFor(gh);
  const [stages, runs] = await Promise.all([
    stageStatuses(gh, repo, config, (id) => store.pinned(repo, id)),
    recentRuns(gh, repo, 10),
  ]);
  const n = stages.length;
  const last = stages[n - 1];
  const prev = n > 1 ? stages[n - 2] : null;
  const waiting = prev ? await changesBetween(gh, repo, last.commit, prev.commit).catch(() => []) : [];
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
    needsMe,
    busy: active ? { by: active.by ?? "someone", stageId: active.stageId ?? "" } : null,
  };
}

/** Every configured repo that has a valid stagedirector.yml. `login` drives needsMe. */
export async function getProjects(login: string | null = null): Promise<ProjectSummary[]> {
  const gh = getOctokit();
  if (!gh) return sampleProjects;
  const repos = configuredRepos();
  const results = await Promise.all(
    repos.map(async (repo) => {
      const config = await loadConfig(gh, repo);
      return config ? summarize(gh, repo, config, login).catch(() => null) : null;
    }),
  );
  return results.filter((p): p is ProjectSummary => p !== null);
}

export async function getProject(repo: string, login: string | null = null): Promise<ProjectSummary | null> {
  const gh = getOctokit();
  if (!gh) return sampleProjects.find((p) => p.repo === repo) ?? null;
  if (!configuredRepos().includes(repo)) return null;
  const config = await loadConfig(gh, repo);
  return config ? summarize(gh, repo, config, login) : null;
}

/** Newest first: dashboard records (approvals, requests, pins…) merged with workflow runs. */
export async function getActivity(repo: string, limit = 50): Promise<ActivityEvent[]> {
  const gh = getOctokit();
  if (!gh) {
    const extra = await storeFor(null).list(repo, limit);
    return [...extra, ...(sampleActivity[repo] ?? [])].slice(0, limit);
  }
  if (!configuredRepos().includes(repo)) return [];
  const [records, runs] = await Promise.all([storeFor(gh).list(repo, limit), recentRuns(gh, repo, limit)]);
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
};
const EVENT_ACTION: Record<StageAction, ActivityEvent["action"]> = {
  deploy: "push",
  rollback: "undo",
  pin: "pin",
  unpin: "unpin",
  "clear-cache": "clear-cache",
  stop: "stop",
  approve: "approve",
};

/**
 * The one place a button press turns into a GitHub call. Checks permission on
 * the server with fresh data from GitHub; never trusts the browser's view.
 * `actor` is the signed-in login, or "claude:<login>" for a Claude session.
 */
export async function performAction(actor: string, input: ActionInput): Promise<ActionResult> {
  const gh = getOctokit();
  const project = await getProject(input.repo);
  if (!project) return { ok: false, status: 404, error: "unknown project" };
  const { config, stages } = project;
  const idx = config.stages.findIndex((s) => s.id === input.stageId);
  if (idx < 0) return { ok: false, status: 400, error: "unknown stage" };
  const prev: StageStatus | null = idx > 0 ? stages[idx - 1] : null;
  const store = storeFor(gh);
  const person = actor.startsWith("claude:") ? actor.slice(7) : actor;
  const role = await getRoleFor(input.repo, person);
  const approval: Approval | null = await store.latestApproval(input.repo, input.stageId);

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
  });
  if (!decision.allowed) return { ok: false, status: 403, error: decision.reason };

  const at = new Date().toISOString();
  const base = { at, actor, stageId: input.stageId, commit: input.commit, note: input.note };

  if (decision.recordAs === "request") {
    const event = await store.append(input.repo, {
      ...base,
      action: "request",
      note: `asks to ${input.action}${input.note ? `: ${input.note}` : ""}`,
    });
    return { ok: true, recordedAs: "request", event };
  }

  if (input.action === "approve") {
    const a: Approval = { commit: input.commit!, stageId: input.stageId, by: actor, at };
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
  const commit = input.commit ?? stages[idx].commit;
  if (!commit) return { ok: false, status: 400, error: "nothing on that stage yet" };
  await startRun(gh, input.repo, config.branch, {
    stage: input.stageId,
    commit,
    action: RUN_ACTIONS[input.action as keyof typeof RUN_ACTIONS],
    requestedBy: actor,
  });
  const event = await store.append(input.repo, { ...base, commit, action: EVENT_ACTION[input.action], result: "queued" });
  return { ok: true, recordedAs: "action", event };
}

export async function getRunLog(repo: string, runId: number): Promise<string | null> {
  const gh = getOctokit();
  if (!gh || !configuredRepos().includes(repo)) return null;
  return runLog(gh, repo, runId);
}
