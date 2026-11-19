# Plan notes

## Shared type changes (src/lib/types.ts)
- 2026-11-18 — `ActivityEvent.runId?: number` added (data layer). Set on events that come from a
  workflow run and on "stop" events, so the UI can link to a run's log and stop a specific run.
- 2026-11-18 — `ProjectConfig.checks?: CheckConfig[]` and `CheckResult` added (checks before and after,
  PR "Checks before and after"). Read from `checks:` in stagedirector.yml; results are stored as `check` activity.
- 2026-11-18 — Claude request flow: `ActivityEvent.action` gains `"decline"`; `ActivityEvent.wants` (on a request)
  and `ActivityEvent.answers` (request id, on the event that answers it); new `PushRequest`.
- 2026-11-19 — `Change.commit?: string`; `pr` is 0 for a commit pushed straight to the branch (no PR), so
  direct commits also show as waiting. Found testing against a real repo.

- 2026-11-19 (engine): `ActivityEvent.action` and `wants` gain `"snapshot"` (Save a backup → workflow action `snapshot` → `tools.snapshot`).
