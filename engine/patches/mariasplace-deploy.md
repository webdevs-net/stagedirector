# Maria's Place: `scripts/deploy.sh` patch

`mariasplace-deploy.patch` makes Maria's Place's deploy script meet
`engine/contract.md`. **Not applied.** Apply it in the Maria's Place repo through a PR.

Base: `scripts/deploy.sh` at commit `9291991` ("deploy the mp-divi-unwrap plugin"),
which is on branches `claude/divi-removal-strategy-4f5a0e` and
`claude/registration-page-design` (not on `main` yet when this was written).
`patch -p1 --dry-run` against that file applies cleanly.

```bash
cd ~/Sites/MariasPlace && git apply --check ~/Sites/stagedirector/engine/patches/mariasplace-deploy.patch
```

## What changes

| Change | Why |
|---|---|
| `die` exits **2** (was 1) | contract: 2 = refused, nothing touched. Smoke-test failure after a deploy still exits 1. |
| `live` and `rollback live` accept **no terminal only when** `STAGEDIRECTOR_APPROVAL` is a valid approval file and `GITHUB_ACTIONS=true` | lets the Stage Director workflow push live after a code owner approved; scripts and AI sessions still cannot. The file must name `stageId: live`, the matching action, `commit == HEAD` (deploy), an approver that is not `claude:*` or `*[bot]`, and be unexpired. A file present outside Actions is an error. |
| The rest of the live rules stay | origin/main only, staged-first, PHP lint, backup, smoke test. When approved via Stage Director it writes the `approved/<sha>` marker with "by <login> via Stage Director <run url>". |
| Server edits on live still need a person | without a terminal, the "overwrite" prompt **refuses** (exit 2) instead of auto-confirming. The >50-files prompt and "deploy live <sha>" are confirmed by the approval. |
| `approve` unchanged | still terminal-only. Stage Director approvals are GitHub records, checked by the workflow. |
| `rollback staging` without a terminal allowed only under Stage Director in Actions | the Safety net. |
| Prints `STAGEDIRECTOR_BACKUP=<ts>` right after the swap | backup id for `rollback … {backup}`. |
| Writes `~/deploy-state/mariasplace/staging.log` like `live.log`, and logs rollbacks of both | so status knows what is on staging after a rollback. `staged/<sha>` markers are kept for the approve rule. |
| Deploy log "by" uses `STAGEDIRECTOR_REQUESTED_BY` when set | records the person, not `stagedirector-runner@ovh1`. |
| `status --json` | prints `StageStatus[]` for staging and live (commit after rollbacks, time, who, `behindBy` from git). Plain `status` unchanged. |
| `drift <staging\|live>` | lists deployed files that differ on the server from the commit on that stage (one path per line). Used as `tools.syncCheck`. |

Runner needs `jq` (installed by `setup-ovh1.sh`).

## Also add to the Maria's Place repo (same PR)

- `.github/workflows/stagedirector.yml` = `engine/workflow/stagedirector.yml`
- `stagedirector.yml` = `examples/mariasplace.stagedirector.yml`, but set
  `tools.syncCheck: scripts/deploy.sh drift live` and add `/bulk-orders/` to smoke tests if
  wanted. `scripts/clear-cache.sh` does not exist yet; remove `tools.clearCache` or add one
  (e.g. `ssh hostinger 'cd domains/mariasplace.com/public_html && wp cache flush'` with a
  staging/live switch on `STAGEDIRECTOR_STAGE`).
- `scripts/copy-live-to-staging.sh` = `engine/examples/mariasplace/copy-live-to-staging.sh`
  (edit Hostinger paths and registration tables). Cutover steps:
  `engine/examples/mariasplace/CUTOVER.md`. Deploy still does not move DB/media or delete
  obsolete plugins — wipe live leftovers by hand before putting lean code live.
- `CODEOWNERS` with a `*` line naming the code owners (people, e.g. `* @<owner-login>`).

## On the runner

The script calls `ssh hostinger`. `setup-ovh1.sh hostkey mariasplace hostinger <user>@<host> <port>`
writes that alias for `stagedirector-runner` (copy user/host/port from your own
`~/.ssh/config` entry for `hostinger`). `wp`, `rsync`, `php` must exist on Hostinger, as today.

## Outside deploys (2026-11-19)

So Stage Director shows what staging/live really run after `scripts/deploy.sh staging`
from a terminal, add to the end of a successful deploy in `scripts/deploy.sh`
(see engine/contract.md "Outside deploys"):

    git rev-parse HEAD > "$REMOTE_WEBROOT/.stagedirector-version"   # via the existing ssh/rsync step
    engine/kits/report-deploy.sh "$STAGE" || true                   # copy the kit into scripts/

Not applied to the Maria's Place repo yet; needs the owner's OK (staging first).
