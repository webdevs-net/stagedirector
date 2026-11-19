# Plan notes

## Shared type changes (src/lib/types.ts)
- 2026-11-18 — `ActivityEvent.runId?: number` added (data layer). Set on events that come from a
  workflow run and on "stop" events, so the UI can link to a run's log and stop a specific run.
- 2026-11-19 — `StageStatus.running?: RunningCommit | null` and `RunningCommit` added (data layer).
  Set when a stage runs a commit Stage Director did not deploy (from `observed-<stage>`
  deployments, see engine/contract.md "Outside deploys"). Display only; permission checks
  and the live gate keep using `commit`.
