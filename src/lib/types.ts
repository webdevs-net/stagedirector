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
    copyLiveToStaging?: string; // valuable live slice → staging (not full DB, not code); action: copy-live
    snapshot?: string;        // e.g. a Kopia command
  };
  liveTodo?: string[];        // manual steps to repeat after a live push
  checks?: CheckConfig[];     // shown in the review step and after each run
  noDowntime?: boolean;       // use release folders + switch when the host allows
  /** Where "Check rules" runs. Default (omit or "self-hosted") = local Actions on a runner labelled sd-gate. Set "github" only to spend GitHub-hosted minutes. */
  gateRunner?: "github" | "self-hosted";
  /** "site" (default) = a website on a host. "app" = a program people download: app wording,
   *  no out-of-sync or backup tools, and the version tag shown next to each stage's commit. */
  type?: "site" | "app";
  /** "none" = the deploy commands reach no host (e.g. they publish a GitHub Release), so the
   *  workflow loads no SSH key and joins no tailnet. Default: a host reached over SSH. */
  host?: "none";
  /** Minutes the deploy job may run (default 45, at most 360). For deploys that build an app. */
  timeoutMinutes?: number;
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
  /** Version tag on `commit` (e.g. "v1.4.0"), for `type: app` projects; null when the commit has no v* tag. */
  version?: string | null;
  /**
   * What the server actually runs, when that differs from `commit` (Stage Director's own
   * record): e.g. a deploy made from a terminal. Display only — never used to allow a push;
   * the live gate still requires a Stage Director deployment of the same commit.
   */
  running?: RunningCommit | null;
}

/** A commit seen on a stage outside Stage Director's own deploys (see engine/contract.md "Outside deploys"). */
export interface RunningCommit {
  commit: string;
  at: string;                 // ISO, when it was reported or seen
  by: string | null;          // who reported it
  source: "terminal" | "version-check";
  ref?: string;               // branch it came from, when known
  behindBy: number;           // commits behind the branch head
  onBranch: boolean;          // false when the commit is not on the project branch (e.g. a feature branch)
}

export interface Change {
  pr: number;                 // 0 for a commit made straight to the branch (no PR)
  commit?: string;            // set for such a commit
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
  action: "push" | "approve" | "pin" | "unpin" | "undo" | "stop" | "request" | "decline" | "clear-cache" | "snapshot" | "copy-live" | "check";
  stageId?: string;
  commit?: string;
  result?: RunState;
  note?: string;
  runId?: number;             // GitHub Actions run id, when the event is (or started) a workflow run
  /** On a "request": what the Claude session asks for. */
  wants?: "deploy" | "rollback" | "pin" | "unpin" | "clear-cache" | "snapshot" | "copy-live" | "approve";
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
  /** What the last stage (live) is known to run: Stage Director's own deploy, or what a status/version check saw
   *  on the server. null = never deployed or checked by Stage Director, so `waiting` is not a real comparison. */
  lastKnown?: { commit: string; source: "deploy" | "observed" } | null;
  needsMe: boolean;
  busy: { by: string; stageId: string } | null;
}
