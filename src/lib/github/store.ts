import type { Octokit } from "@octokit/rest";
import type { ActivityEvent, Approval } from "@/lib/types";
import { splitRepo } from "./client";

/**
 * Where approvals, requests, pins and other dashboard actions are recorded.
 *
 * Choice: GitHub Deployments on a dedicated environment ("stagedirector-log").
 * Each event is one deployment whose payload is the ActivityEvent (and, for
 * approvals, the Approval). Why:
 *  - The dashboard keeps no state of its own; the rule is that history comes
 *    from GitHub. Anyone can audit it in the repo's Deployments view.
 *  - Deployments are tied to an exact commit (ref = SHA), which is what an
 *    approval must be.
 *  - The engine's workflow can read the latest approval with the same API to
 *    double-check before a live push.
 * Forgery guard: only records created by the dashboard's own GitHub identity
 * are trusted (anyone with write access can create deployments).
 */
export interface EventStore {
  append(repo: string, event: Omit<ActivityEvent, "id">, approval?: Approval): Promise<ActivityEvent>;
  list(repo: string, limit?: number): Promise<ActivityEvent[]>;
  latestApproval(repo: string, stageId: string): Promise<Approval | null>;
  pinned(repo: string, stageId: string): Promise<boolean>;
}

export const LOG_ENVIRONMENT = "stagedirector-log";

interface Payload {
  stagedirector: 1;
  event: Omit<ActivityEvent, "id">;
  approval?: Approval;
}

function fromRecords(records: { id: string; payload: Payload }[]) {
  return records; // newest first
}

function latestApprovalOf(records: { payload: Payload }[], stageId: string): Approval | null {
  for (const r of records) {
    const e = r.payload.event;
    if (e.stageId !== stageId) continue;
    // A push to the stage uses up the approval.
    if (e.action === "push" && e.result !== "failed") return null;
    if (e.action === "approve" && r.payload.approval) return r.payload.approval;
  }
  return null;
}

function pinnedOf(records: { payload: Payload }[], stageId: string): boolean {
  for (const r of records) {
    const e = r.payload.event;
    if (e.stageId !== stageId) continue;
    if (e.action === "pin") return true;
    if (e.action === "unpin") return false;
  }
  return false;
}

export class MemoryStore implements EventStore {
  private data = new Map<string, { id: string; payload: Payload }[]>();
  private n = 0;
  async append(repo: string, event: Omit<ActivityEvent, "id">, approval?: Approval) {
    const id = `mem-${++this.n}`;
    const list = this.data.get(repo) ?? [];
    list.unshift({ id, payload: { stagedirector: 1, event, approval } });
    this.data.set(repo, list);
    return { id, ...event };
  }
  async list(repo: string, limit = 50) {
    return fromRecords(this.data.get(repo) ?? []).slice(0, limit).map((r) => ({ id: r.id, ...r.payload.event }));
  }
  async latestApproval(repo: string, stageId: string) {
    return latestApprovalOf(this.data.get(repo) ?? [], stageId);
  }
  async pinned(repo: string, stageId: string) {
    return pinnedOf(this.data.get(repo) ?? [], stageId);
  }
}

export class DeploymentStore implements EventStore {
  constructor(
    private gh: Octokit,
    private self: () => Promise<string>,
    private defaultRef: (repo: string) => Promise<string>,
  ) {}

  private async records(repo: string, limit = 100) {
    const me = (await this.self()).toLowerCase();
    const { data } = await this.gh.rest.repos.listDeployments({
      ...splitRepo(repo),
      environment: LOG_ENVIRONMENT,
      per_page: Math.min(limit, 100),
    });
    return data
      .filter((d) => d.creator?.login?.toLowerCase() === me)
      .map((d) => ({ id: String(d.id), payload: d.payload as unknown as Payload }))
      .filter((r) => r.payload && r.payload.stagedirector === 1 && r.payload.event);
  }

  async append(repo: string, event: Omit<ActivityEvent, "id">, approval?: Approval) {
    const ref = event.commit ?? (await this.defaultRef(repo));
    const payload: Payload = { stagedirector: 1, event, approval };
    const { data } = await this.gh.rest.repos.createDeployment({
      ...splitRepo(repo),
      ref,
      environment: LOG_ENVIRONMENT,
      task: `stagedirector:${event.action}`,
      description: `${event.actor} ${event.action}${event.stageId ? ` ${event.stageId}` : ""}`.slice(0, 140),
      payload: payload as unknown as Record<string, unknown>,
      auto_merge: false,
      required_contexts: [],
      transient_environment: true,
      production_environment: false,
    });
    if (!("id" in data)) throw new Error("GitHub did not record the event");
    // Mark inactive so the log environment never shows as a "live" deployment.
    await this.gh.rest.repos
      .createDeploymentStatus({ ...splitRepo(repo), deployment_id: data.id, state: "inactive" })
      .catch(() => undefined);
    return { id: String(data.id), ...event };
  }

  async list(repo: string, limit = 50) {
    return (await this.records(repo, limit)).map((r) => ({ id: r.id, ...r.payload.event }));
  }
  async latestApproval(repo: string, stageId: string) {
    return latestApprovalOf(await this.records(repo), stageId);
  }
  async pinned(repo: string, stageId: string) {
    return pinnedOf(await this.records(repo), stageId);
  }
}
