// Shared contract for Stage Director. Every part of the app (UI, data layer,
// engine) uses these shapes. Change them only with a note in docs/PLAN.md.

/** One stage a project's code moves through, in order (e.g. local → staging → live). */
export interface StageConfig {
  id: string;                 // "local" | "staging" | "live" | any project-defined id
  name: string;               // shown on screen, e.g. "Staging"
  url?: string;               // "Open" button target
  /** Who may push INTO this stage. */
  pushers: "developers" | "code-owners" | "none";
  /** How code arrives: "auto" = on every merge to the source branch, "manual" = a person presses the button. */
  trigger: "auto" | "manual";
  /** Commands the runner executes. Paths are relative to the project repo. */
  deploy?: string;            // e.g. "scripts/deploy.sh staging"
  rollback?: string;          // e.g. "scripts/deploy.sh rollback staging {backup}"
  status?: string;            // prints JSON StageStatus to stdout
  /** Pages fetched after a push; any non-2xx/401 response fails the check. */
  smokeTest?: string[];
  /** Runner label in GitHub Actions (self-hosted), e.g. "ovh1". */
  runner?: string;
}

/** stagedirector.yml at the root of each project repo. */
export interface ProjectConfig {
  version: 1;
  name: string;               // "Maria's Place"
  group?: string;             // client or team, for grouping on the home screen
  kind?: string;              // badge, e.g. "WordPress · Hostinger"
  branch: string;             // source branch, normally "main"
  stages: StageConfig[];      // in order; the first is usually local
  tools?: {
    clearCache?: string;      // command
    syncCheck?: string;       // command, prints changed paths
    copyLiveToStaging?: string;
    snapshot?: string;        // e.g. a Kopia command
  };
  liveTodo?: string[];        // manual steps to repeat after a live push
  checks?: CheckConfig[];     // shown in the review step and after each run
  noDowntime?: boolean;       // use release folders + switch when the host allows
}

/** One check the dashboard runs against a stage (before approving, and after each run). */
export interface CheckConfig {
  name: string;               // "Login page works"
  pages: string[];            // paths, e.g. ["/login/"]; each must answer 2xx (401 is OK on non-last stages)
  expect?: string;            // text every page must contain, e.g. "Lost your password"
  forbid?: string[];          // text no page may contain, e.g. ["Fatal error", "Warning:"]
  stages?: string[];          // stage ids to run on; default: every stage with a url
}

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;             // plain words, e.g. "/login/ answered 500"
}

export type Role = "viewer" | "developer" | "code-owner";

export type RunState = "queued" | "running" | "passed" | "failed" | "stopped" | "undone";

export interface StageStatus {
  stageId: string;
  commit: string | null;      // full SHA on that stage
  deployedAt: string | null;  // ISO
  deployedBy: string | null;  // GitHub login or "auto"
  behindBy: number;           // commits behind the previous stage
  outOfSync: string[];        // files changed on the server outside git
  pinned: boolean;
}

export interface Change {
  pr: number;
  title: string;
  summary: string;            // plain-English summary
  url: string;
  pages?: string[];           // paths worth checking, e.g. "/login/"
}

export interface Approval {
  commit: string;
  stageId: string;            // stage it unlocks, e.g. "live"
  by: string;                 // must be a code owner
  at: string;                 // ISO
}

export interface ActivityEvent {
  id: string;
  at: string;
  actor: string;              // GitHub login, "auto", or "claude:<login>" for a session acting for a person
  action: "push" | "approve" | "pin" | "unpin" | "undo" | "stop" | "request" | "decline" | "clear-cache" | "snapshot" | "check";
  stageId?: string;
  commit?: string;
  result?: RunState;
  note?: string;
  runId?: number;             // GitHub Actions run id, when the event is (or started) a workflow run
  /** On a "request": what the Claude session asks for. */
  wants?: "deploy" | "rollback" | "pin" | "unpin" | "clear-cache" | "snapshot" | "approve";
  /** On the event that answers a request (the push it led to, or a "decline"): the request's id. */
  answers?: string;
}

/** An open request from a Claude session, waiting for a person's OK. */
export interface PushRequest {
  id: string;                 // the request event's id
  at: string;
  actor: string;              // "claude:<login>"
  stageId: string;
  wants: NonNullable<ActivityEvent["wants"]>;
  commit?: string;
  note?: string;
}

export interface ProjectSummary {
  repo: string;               // "owner/name"
  config: ProjectConfig;
  stages: StageStatus[];
  waiting: Change[];          // on the last-but-one stage, not yet on the last
  needsMe: boolean;
  busy: { by: string; stageId: string } | null;
}
