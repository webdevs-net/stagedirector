import type { Octokit } from "@octokit/rest";
import type { Change, ProjectConfig, RunningCommit, RunState, StageStatus } from "@/lib/types";
import { safeParseConfig } from "@/lib/config";
import type { RoleSource } from "@/lib/auth/roles";
import { CONFIG_FILE, WORKFLOW_FILE, splitRepo } from "./client";
import { summarize, summariesEnabled } from "./summary";

// Contract with the engine's workflow (.github/workflows/stagedirector.yml):
//  - workflow_dispatch inputs: stage, commit, action, requested_by
//  - run-name: "stagedirector <action> <stage> <commit> by <requested_by>"
//  - a deploy creates a GitHub Deployment with environment = stage id and
//    ref = commit, payload { stagedirector: 1, actor, outOfSync?: string[] },
//    and sets its status to success / failure.

export type RunAction = "deploy" | "rollback" | "pin" | "unpin" | "clear-cache" | "snapshot";

export async function readFile(gh: Octokit, repo: string, path: string, ref?: string): Promise<string | null> {
  try {
    const { data } = await gh.rest.repos.getContent({ ...splitRepo(repo), path, ref });
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) return null;
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

export async function readConfig(gh: Octokit, repo: string) {
  const text = await readFile(gh, repo, CONFIG_FILE);
  if (text == null) return null;
  return safeParseConfig(text);
}

export function roleSource(gh: Octokit): RoleSource {
  return {
    readFile: (repo, path) => readFile(gh, repo, path),
    permission: async (repo, login) => {
      try {
        const { data } = await gh.rest.repos.getCollaboratorPermissionLevel({ ...splitRepo(repo), username: login });
        return data.permission;
      } catch (e) {
        if ((e as { status?: number }).status === 404) return "none";
        throw e;
      }
    },
    inTeam: async (org, team_slug, username) => {
      try {
        const { data } = await gh.rest.teams.getMembershipForUserInOrg({ org, team_slug, username });
        return data.state === "active";
      } catch {
        return false;
      }
    },
  };
}

/** Pinned = the git ref refs/stagedirector/pins/<stage> exists (the workflow creates and deletes it). */
export async function pinRefExists(gh: Octokit, repo: string, stageId: string): Promise<boolean> {
  try {
    await gh.rest.git.getRef({ ...splitRepo(repo), ref: `stagedirector/pins/${stageId}` });
    return true;
  } catch (e) {
    if ((e as { status?: number }).status === 404) return false;
    throw e;
  }
}

export async function defaultBranchHead(gh: Octokit, repo: string, branch: string): Promise<string> {
  const { data } = await gh.rest.repos.getBranch({ ...splitRepo(repo), branch });
  return data.commit.sha;
}

interface Deployed {
  commit: string;
  at: string;
  by: string | null;
  outOfSync: string[];
}

async function latestSuccessfulDeployment(gh: Octokit, repo: string, stageId: string): Promise<Deployed | null> {
  const { data } = await gh.rest.repos.listDeployments({ ...splitRepo(repo), environment: stageId, per_page: 10 });
  for (const d of data) {
    const { data: statuses } = await gh.rest.repos.listDeploymentStatuses({ ...splitRepo(repo), deployment_id: d.id, per_page: 1 });
    const s = statuses[0];
    // "inactive" = superseded by a newer deploy; failures never count as on the stage.
    if (s?.state === "success") {
      const payload = (d.payload ?? {}) as { actor?: string; outOfSync?: unknown };
      return {
        commit: d.sha,
        at: s.created_at,
        by: payload.actor ?? d.creator?.login ?? null,
        outOfSync: Array.isArray(payload.outOfSync) ? payload.outOfSync.map(String) : [],
      };
    }
  }
  return null;
}

/** GitHub environment for outside-deploy records. Never equal to a stage id, so the live gate ignores it. */
export const observedEnvironment = (stageId: string) => `observed-${stageId}`;

export interface Observed {
  commit: string;
  at: string;
  by: string | null;
  source: RunningCommit["source"];
  ref?: string;
}

/** Newest outside-deploy record for a stage (written by engine/kits/report-deploy.sh or the observe workflow). */
export async function latestObserved(gh: Octokit, repo: string, stageId: string): Promise<Observed | null> {
  const { data } = await gh.rest.repos.listDeployments({ ...splitRepo(repo), environment: observedEnvironment(stageId), per_page: 1 });
  const d = data[0];
  if (!d) return null;
  const payload = (d.payload ?? {}) as { actor?: string; source?: string; ref?: string };
  return {
    commit: d.sha,
    at: d.created_at,
    by: payload.actor ?? d.creator?.login ?? null,
    source: payload.source === "version-check" ? "version-check" : "terminal",
    ref: payload.ref ?? (d.ref !== d.sha ? d.ref : undefined),
  };
}

/** The outside record wins when it is newer than Stage Director's own deploy and names a different commit. */
export function pickRunning(own: { commit: string; at: string } | null, seen: Observed | null): Observed | null {
  if (!seen) return null;
  if (own && seen.commit === own.commit) return null;
  if (own && Date.parse(seen.at) <= Date.parse(own.at)) return null;
  return seen;
}

async function behind(gh: Octokit, repo: string, base: string | null, head: string | null): Promise<number> {
  if (!base || !head || base === head) return 0;
  const { data } = await gh.rest.repos.compareCommitsWithBasehead({ ...splitRepo(repo), basehead: `${base}...${head}`, per_page: 1 });
  return data.ahead_by;
}

/** Status of every stage. Stages with nothing deployed (e.g. local) have commit null. */
export async function stageStatuses(
  gh: Octokit,
  repo: string,
  config: ProjectConfig,
  pinned: (stageId: string) => Promise<boolean>,
): Promise<StageStatus[]> {
  const head = await defaultBranchHead(gh, repo, config.branch).catch(() => null);
  const [deployed, observed] = await Promise.all([
    Promise.all(config.stages.map((s) => (s.pushers === "none" ? Promise.resolve(null) : latestSuccessfulDeployment(gh, repo, s.id)))),
    Promise.all(config.stages.map((s) => (s.pushers === "none" ? Promise.resolve(null) : latestObserved(gh, repo, s.id).catch(() => null)))),
  ]);
  return Promise.all(
    config.stages.map(async (s, i) => {
      const d = deployed[i];
      const seen = pickRunning(d, observed[i]);
      let running: RunningCommit | null = null;
      if (seen && head) {
        const cmp = await gh.rest.repos
          .compareCommitsWithBasehead({ ...splitRepo(repo), basehead: `${seen.commit}...${head}`, per_page: 1 })
          .then((r) => r.data)
          .catch(() => null);
        running = { ...seen, behindBy: cmp?.ahead_by ?? 0, onBranch: cmp ? cmp.behind_by === 0 : false };
      }
      // Compare with the previous stage that has a commit, or the branch head.
      let prev: string | null = head;
      for (let j = i - 1; j >= 0; j--) if (deployed[j]) { prev = deployed[j]!.commit; break; }
      return {
        stageId: s.id,
        commit: d?.commit ?? null,
        deployedAt: d?.at ?? null,
        deployedBy: d?.by ?? null,
        behindBy: d ? await behind(gh, repo, d.commit, prev).catch(() => 0) : 0,
        outOfSync: d?.outOfSync ?? [],
        pinned: s.pushers === "none" ? false : await pinned(s.id),
        running,
      };
    }),
  );
}

function plainSummary(body: string | null | undefined, title: string): string {
  const line = (body ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^#+\s*|^[-*]\s*/, "").trim())
    .find((l) => l && !l.startsWith("<!--"));
  return (line ?? title).slice(0, 240);
}

/**
 * What is in `to` but not yet in `from` (e.g. staging vs live): merged PRs, plus
 * commits made straight to the branch with no PR. `from` null = the stage was
 * never pushed: the newest commits up to `to` (at most 20).
 */
export async function changesBetween(gh: Octokit, repo: string, from: string | null, to: string | null): Promise<Change[]> {
  if (!to || from === to) return [];
  let commits: { sha: string; commit: { message: string }; html_url: string }[];
  if (from) {
    const { data } = await gh.rest.repos.compareCommitsWithBasehead({ ...splitRepo(repo), basehead: `${from}...${to}`, per_page: 100 });
    commits = data.commits.slice(-50);
  } else {
    const { data } = await gh.rest.repos.listCommits({ ...splitRepo(repo), sha: to, per_page: 20 });
    commits = data.slice().reverse();
  }
  const seen = new Map<number, Change>();
  const direct: Change[] = [];
  const bodies = new Map<number, { body: string | null; sha: string }>();
  for (const c of commits) {
    const { data: prs } = await gh.rest.repos.listPullRequestsAssociatedWithCommit({ ...splitRepo(repo), commit_sha: c.sha });
    const merged = prs.filter((pr) => pr.merged_at);
    if (merged.length === 0 && !/^Merge (pull request|branch)/.test(c.commit.message)) {
      const [title, ...rest] = c.commit.message.split("\n");
      direct.push({ pr: 0, commit: c.sha, title: title.slice(0, 200), summary: plainSummary(rest.join("\n"), title), url: c.html_url });
    }
    for (const pr of merged) {
      if (!pr.merged_at || seen.has(pr.number)) continue;
      const pages = (pr.body ?? "").match(/(?<=\bpages?:\s*)(\/[^\s,]*(?:[\s,]+\/[^\s,]*)*)/i)?.[0].split(/[\s,]+/);
      seen.set(pr.number, { pr: pr.number, title: pr.title, summary: plainSummary(pr.body, pr.title), url: pr.html_url, ...(pages ? { pages } : {}) });
      bodies.set(pr.number, { body: pr.body, sha: pr.merge_commit_sha ?? pr.head.sha });
    }
  }
  // "What this update does": Claude's plain summary when ANTHROPIC_API_KEY is set (cached per PR), else the first line of the description.
  if (summariesEnabled()) {
    await Promise.all(
      [...seen.values()].map(async (ch) => {
        const b = bodies.get(ch.pr)!;
        const files = await gh.paginate(gh.rest.pulls.listFiles, { ...splitRepo(repo), pull_number: ch.pr, per_page: 100 }).catch(() => []);
        ch.summary = await summarize({ repo, number: ch.pr, title: ch.title, body: b.body, sha: b.sha, files: files.map((f) => f.filename) });
      }),
    );
  }
  return [...[...seen.values()].sort((a, b) => a.pr - b.pr), ...direct];
}

export interface RunInfo {
  id: number;
  action: string | null;
  stageId: string | null;
  commit: string | null;
  by: string | null;
  state: RunState;
  url: string;
  startedAt: string;
  updatedAt?: string;
}

const TITLE = /^stagedirector (\S+) (\S+) (\S+) by (\S+)/;
export function parseRunTitle(title: string | null | undefined) {
  const m = TITLE.exec(title ?? "");
  return m ? { action: m[1], stageId: m[2], commit: m[3], by: m[4] } : null;
}

/** A push run's title says "auto" for the stage: that is the first stage with trigger: auto. */
export function resolveRunStage(config: ProjectConfig, stageId: string | null): string | null {
  if (stageId !== "auto") return stageId;
  return config.stages.find((s) => s.trigger === "auto" && s.pushers !== "none")?.id ?? null;
}

export function runState(status: string | null, conclusion: string | null): RunState {
  if (status === "queued" || status === "waiting" || status === "pending" || status === "requested") return "queued";
  if (status !== "completed") return "running";
  if (conclusion === "success") return "passed";
  if (conclusion === "cancelled") return "stopped";
  return "failed";
}

export async function recentRuns(gh: Octokit, repo: string, perPage = 20): Promise<RunInfo[]> {
  try {
    const { data } = await gh.rest.actions.listWorkflowRuns({ ...splitRepo(repo), workflow_id: WORKFLOW_FILE, per_page: perPage });
    return data.workflow_runs.map((r) => {
      const t = parseRunTitle(r.display_title);
      return {
        id: r.id,
        action: t?.action ?? null,
        stageId: t?.stageId ?? null,
        commit: t?.commit ?? r.head_sha,
        by: t?.by ?? r.triggering_actor?.login ?? null,
        state: runState(r.status, r.conclusion),
        url: r.html_url,
        startedAt: r.run_started_at ?? r.created_at,
        updatedAt: r.updated_at,
      };
    });
  } catch (e) {
    if ((e as { status?: number }).status === 404) return [];
    throw e;
  }
}

export async function startRun(
  gh: Octokit,
  repo: string,
  branch: string,
  inputs: { stage: string; commit: string; action: RunAction; requestedBy: string },
): Promise<void> {
  await gh.rest.actions.createWorkflowDispatch({
    ...splitRepo(repo),
    workflow_id: WORKFLOW_FILE,
    ref: branch,
    inputs: { stage: inputs.stage, commit: inputs.commit, action: inputs.action, requested_by: inputs.requestedBy },
  });
}

export async function cancelRun(gh: Octokit, repo: string, runId: number): Promise<void> {
  await gh.rest.actions.cancelWorkflowRun({ ...splitRepo(repo), run_id: runId });
}

/** Plain-text log of every job in a run (GitHub redirects to a signed URL). */
export async function runLog(gh: Octokit, repo: string, runId: number): Promise<string> {
  const { data } = await gh.rest.actions.listJobsForWorkflowRun({ ...splitRepo(repo), run_id: runId });
  const parts: string[] = [];
  for (const job of data.jobs) {
    try {
      const res = await gh.rest.actions.downloadJobLogsForWorkflowRun({ ...splitRepo(repo), job_id: job.id });
      parts.push(`=== ${job.name} ===\n${String(res.data)}`);
    } catch {
      parts.push(`=== ${job.name} ===\n(log not available yet)`);
    }
  }
  return parts.join("\n\n");
}
