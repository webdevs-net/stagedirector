import type { Approval, ProjectConfig, Role, StageConfig } from "@/lib/types";

export type StageAction = "deploy" | "rollback" | "pin" | "unpin" | "clear-cache" | "stop" | "approve";

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
  return { allowed: true, recordAs: "action" };
}
