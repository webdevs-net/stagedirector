# Plan notes

## Shared type changes (src/lib/types.ts)
- 2026-11-23 — Apps (Loquio): `ProjectConfig.type?: "site" | "app"` (wording, site-only tools hidden),
  `ProjectConfig.host?: "none"` (workflow loads no SSH key, joins no tailnet), `ProjectConfig.timeoutMinutes?`
  (deploy job limit, 5–360, default 45), and `StageStatus.version?: string | null` (the `v*` tag on the stage's
  commit, filled for `type: app` from the repo's tags). App projects build their first deployable stage from a chosen
  release tag: `startRun(..., commit?)` and the `BuildFromTag` picker; the tag list is `releaseCandidates()`.
- `ProjectConfig.gateRunner?: "github" | "self-hosted"` (engine): where the workflow's "Check rules" job runs; passed as the `gate_runner` dispatch input.
- 2026-11-18 — `ActivityEvent.runId?: number` added (data layer). Set on events that come from a
  workflow run and on "stop" events, so the UI can link to a run's log and stop a specific run.
- 2026-11-18 — `ProjectConfig.checks?: CheckConfig[]` and `CheckResult` added (checks before and after,
  PR "Checks before and after"). Read from `checks:` in stagedirector.yml; results are stored as `check` activity.
- 2026-11-18 — Claude request flow: `ActivityEvent.action` gains `"decline"`; `ActivityEvent.wants` (on a request)
  and `ActivityEvent.answers` (request id, on the event that answers it); new `PushRequest`.
- 2026-11-19 — `Change.commit?: string`; `pr` is 0 for a commit pushed straight to the branch (no PR), so
  direct commits also show as waiting. Found testing against a real repo.

- 2026-11-19 (engine): `ActivityEvent.action` and `wants` gain `"snapshot"` (Save a backup → workflow action `snapshot` → `tools.snapshot`).
- 2026-11-19 — `StageStatus.running?: RunningCommit | null` and `RunningCommit` added (data layer).
  Set when a stage runs a commit Stage Director did not deploy (from `observed-<stage>`
  deployments, see engine/contract.md "Outside deploys"). Display only; permission checks
  and the live gate keep using `commit`.
- 2026-11-19 (runner resilience) — no change to types.ts. `ActiveRun.waitingForRunner?: string` added in src/lib/mock.ts (runner label a stuck-queued run waits for); runner health types (`RunnerHealth`, `RunnerState`) live in src/lib/github/runners.ts.
