# Plan notes

## Shared type changes (src/lib/types.ts)
- 2026-11-18 — `ActivityEvent.runId?: number` added (data layer). Set on events that come from a
  workflow run and on "stop" events, so the UI can link to a run's log and stop a specific run.
