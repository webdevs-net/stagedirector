import type { Approval, ProjectConfig, Role, StageConfig } from "@/lib/types";

export type StageAction = "deploy" | "rollback" | "pin" | "unpin" | "clear-cache" | "snapshot" | "stop" | "approve";

export type Decision =
  | { allowed: true; recordAs: "action" | "request" }
  | { allowed: false; reason: string };

export interface ActionRequest {
  config: ProjectConfig;
  stageId: string;
  action: StageAction;
  /** GitHub login, or "claude:<login>" for a Claude session acting for a person. */
  actor: string;
  role: Role;
  /** Commit to push or approve. Required for deploy/approve. */
  commit?: string;
  /** Commit currently on the stage before this one (e.g. staging), for approval checks. */
  previousStageCommit?: string | null;
  /** Latest approval recorded for this stage, if any. */
  approval?: Approval | null;
  /** Is the stage pinned? Matches the workflow's check: a pinned stage takes no deploy or rollback. */
  pinned?: boolean;
}

export const isClaude = (actor: string) => actor.startsWith("claude:");

function stageOf(config: ProjectConfig, id: string): { stage: StageConfig; index: number } | null {
  const index = config.stages.findIndex((s) => s.id === id);
  return index < 0 ? null : { stage: config.stages[index], index };
}

function mayPush(stage: StageConfig, role: Role): boolean {
  if (stage.pushers === "none") return false;
  if (stage.pushers === "developers") return role === "developer" || role === "code-owner";
  return role === "code-owner";
}

/** Is this approval valid for pushing `commit` while the previous stage holds `previousStageCommit`? */
export function approvalValid(
  approval: Approval | null | undefined,
  stageId: string,
  commit: string | undefined,
  previousStageCommit: string | null | undefined,
): boolean {
  if (!approval || !commit) return false;
  if (approval.stageId !== stageId) return false;
  if (isClaude(approval.by)) return false;
  if (approval.commit !== commit) return false;
  // If the stage before moved since approval, the approval no longer describes what was checked.
  if (previousStageCommit && previousStageCommit !== approval.commit) return false;
  return true;
}

/**
 * Server-side permission check. Every API route calls this before touching GitHub.
 * Claude sessions may ask (recorded as a "request") but never approve or push
 * a code-owners stage themselves.
 */
export function decide(req: ActionRequest): Decision {
  const found = stageOf(req.config, req.stageId);
  if (!found) return { allowed: false, reason: `unknown stage "${req.stageId}"` };
  const { stage } = found;
  const claude = isClaude(req.actor);

  if (req.role === "viewer") return { allowed: false, reason: "you can look but not change this project" };
  if (stage.pushers === "none") return { allowed: false, reason: `${stage.name} is not pushed from here` };

  // A Claude session never changes a stage itself: everything but Stop becomes a request a person must OK.
  if (claude && req.action !== "stop") {
    if (req.action === "approve" && stage.pushers !== "code-owners") return { allowed: false, reason: `${stage.name} needs no approval` };
    if (req.action === "deploy" && !req.commit) return { allowed: false, reason: "pick a commit to push" };
    return { allowed: true, recordAs: "request" };
  }

  if (req.action === "approve") {
    if (stage.pushers !== "code-owners") return { allowed: false, reason: `${stage.name} needs no approval` };
    if (!req.commit) return { allowed: false, reason: "approval needs an exact commit" };
    if (claude) return { allowed: true, recordAs: "request" };
    if (req.role !== "code-owner") return { allowed: false, reason: "only a code owner can approve" };
    if (req.previousStageCommit && req.previousStageCommit !== req.commit) {
      return { allowed: false, reason: "that commit is not what is on the stage before; check again" };
    }
    return { allowed: true, recordAs: "action" };
  }

  if (!mayPush(stage, req.role)) {
    if (claude) return { allowed: true, recordAs: "request" };
    return {
      allowed: false,
      reason: stage.pushers === "code-owners" ? `only a code owner can change ${stage.name}` : "not allowed",
    };
  }

  if (req.pinned && (req.action === "deploy" || req.action === "rollback")) {
    return { allowed: false, reason: `${stage.name} is pinned. Unpin it first.` };
  }
  if (req.action === "pin" && req.pinned) return { allowed: false, reason: `${stage.name} is already pinned` };
  if (req.action === "unpin" && req.pinned === false) return { allowed: false, reason: `${stage.name} is not pinned` };

  // Code-owners stages: a Claude session never starts the run itself.
  if (stage.pushers === "code-owners" && claude) return { allowed: true, recordAs: "request" };

  if (req.action === "deploy") {
    if (!req.commit) return { allowed: false, reason: "pick a commit to push" };
    if (stage.pushers === "code-owners" && !approvalValid(req.approval, stage.id, req.commit, req.previousStageCommit)) {
      return { allowed: false, reason: "needs a code owner's approval of this exact commit first" };
    }
  }
  if (req.action === "clear-cache" && !req.config.tools?.clearCache) {
    return { allowed: false, reason: "this project has no clear-cache command" };
  }
  if (req.action === "snapshot" && !req.config.tools?.snapshot) {
    return { allowed: false, reason: "this project has no backup command (tools.snapshot)" };
  }
  return { allowed: true, recordAs: "action" };
}

/**
 * May `actor` (with `role`) OK a Claude session's request for this stage?
 * Staging-like stages: any person who may push there. Code-owner stages: a code owner.
 * An actor starting with "claude:" can never OK anything.
 */
export function mayAnswer(config: ProjectConfig, stageId: string, actor: string, role: Role): { ok: true } | { ok: false; reason: string } {
  if (isClaude(actor)) return { ok: false, reason: "a Claude session can never OK a request; a person must" };
  const found = stageOf(config, stageId);
  if (!found) return { ok: false, reason: `unknown stage "${stageId}"` };
  if (role === "viewer") return { ok: false, reason: "you can look but not change this project" };
  if (found.stage.pushers === "code-owners" && role !== "code-owner") return { ok: false, reason: `only a code owner can OK a request for ${found.stage.name}` };
  return { ok: true };
}

/** Requests that nobody has answered yet, newest first. */
export function openRequestsOf<E extends { id: string; at: string; actor: string; action: string; stageId?: string; wants?: string; commit?: string; note?: string; answers?: string }>(events: E[]) {
  const answered = new Set(events.map((e) => e.answers).filter(Boolean));
  return events.filter((e) => e.action === "request" && e.wants && e.stageId && !answered.has(e.id));
}
