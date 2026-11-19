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
  noDowntime?: boolean;       // use release folders + switch when the host allows
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
  action: "push" | "approve" | "pin" | "unpin" | "undo" | "stop" | "request" | "clear-cache" | "check";
  stageId?: string;
  commit?: string;
  result?: RunState;
  note?: string;
  runId?: number;             // GitHub Actions run id, when the event is (or started) a workflow run
}

export interface ProjectSummary {
  repo: string;               // "owner/name"
  config: ProjectConfig;
  stages: StageStatus[];
  waiting: Change[];          // on the last-but-one stage, not yet on the last
  needsMe: boolean;
  busy: { by: string; stageId: string } | null;
}
