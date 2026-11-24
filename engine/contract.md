# Deploy-command contract

Every project that Stage Director drives implements the commands named in its
`stagedirector.yml` (`deploy`, `rollback`, `status`, `tools.*`). The workflow in
`engine/workflow/stagedirector.yml` runs them on the self-hosted runner, from a clean
checkout of the commit being moved, with the host SSH key loaded in `ssh-agent`.

The dashboard never runs these commands and never talks to a host. It starts a
`workflow_dispatch` run and reads results from the GitHub API.

## Environment the commands get

| Variable | Meaning |
|---|---|
| `STAGEDIRECTOR=1` | running under Stage Director |
| `GITHUB_ACTIONS=true` | set by Actions |
| `STAGEDIRECTOR_STAGE` | stage id, e.g. `live` |
| `STAGEDIRECTOR_COMMIT` | full SHA; equals `git rev-parse HEAD` |
| `STAGEDIRECTOR_ACTOR` | GitHub login that started the run |
| `STAGEDIRECTOR_REQUESTED_BY` | who asked, as sent by the dashboard (`auto` for pushes) |
| `STAGEDIRECTOR_RUN_URL` | link to the run, for logs and records |
| `STAGEDIRECTOR_APPROVAL` | path to the approval file; only for `deploy`/`rollback` into a `pushers: code-owners` stage |
| `STAGEDIRECTOR_NO_DOWNTIME` | `1` when `noDowntime: true` in `stagedirector.yml`, else `0` (see [No-downtime switch](#no-downtime-switch-nodowntime-true)) |
| `SSH_AUTH_SOCK` | agent holding the host key from the environment secret |

There is no terminal (stdin is not a TTY). A command must never wait for input.

`GH_TOKEN` is the run's own token (`contents: write`, `deployments: write`, `actions: read`). An app
project whose deploy starts its own release workflow sets `actions: write` in its copy of the workflow
(one line, marked there); websites keep `read`. With that, a deploy command may start the project's
own workflow and follow it
(`gh workflow run release.yml …` then `gh run watch <id> --exit-status`). A run started with this token
is attributed to `github-actions[bot]`, so the started workflow must not trust its actor: check the
approval record itself if it releases anything (Loquio's `release-check.sh` does).

Placeholders in `stagedirector.yml` commands: `{backup}`, `{commit}`, `{stage}`.

## Where the job runs

`runner: <label>` in `stagedirector.yml` = self-hosted runner with that label.
`runner: github` = GitHub-hosted `ubuntu-latest`; if the environment has
`TS_OAUTH_CLIENT_ID`/`TS_OAUTH_SECRET` the job joins the tailnet first, and the variable
`STAGEDIRECTOR_KNOWN_HOSTS` pins host keys. Used with `kits/ssh-compose` (forced-command SSH).
The rules check runs GitHub-hosted unless `gateRunner: self-hosted` (a runner labelled `sd-gate`).

`host: none` in `stagedirector.yml`: the commands reach no host (an app published as a GitHub
Release, a package registry). The workflow then skips Tailscale, known hosts and the SSH key, so the
stage's environment needs no host secrets.

`timeoutMinutes` (5–360, default 45): how long the deploy job may run. A deploy that starts another
workflow and follows it needs room for that workflow's whole run. If the Stage Director job is
cancelled or times out, the workflow it started keeps running: check it before pressing again.

`type: app`: dashboard wording only ("Release to users", "Download the beta"); the website-only
tools are hidden. The dashboard shows the `v*` tag on each stage's commit.

## Exit codes

| Code | Meaning | Workflow does |
|---|---|---|
| `0` | done | runs the stage's smoke test, then `tools.clearCache` |
| `2` | refused before touching the host (a rule failed, bad input, unreachable host) | marks the deployment `failure`; no rollback |
| anything else | failed, the host may be changed | Safety net: runs `rollback` with the backup id if one was printed, marks the deployment `failure` (rolled back) or `error` (could not roll back) |

## Backup id

`deploy` prints one line, exactly:

```
STAGEDIRECTOR_BACKUP=<id>
```

as soon as the backup exists, before anything that can fail afterwards (swap,
smoke test). `<id>` matches `[A-Za-z0-9._:-]+`. The workflow stores it in the
GitHub Deployment status (`backup=<id>`) and passes it to `rollback` as `{backup}`.
A deploy that changed nothing may omit it.

`rollback <stage> <id>` restores the host to how it was before that deploy, runs
without input, and exits `0` only when it did.

## Smoke test

After exit `0` the workflow fetches `url` + each `smokeTest` path. Only 2xx passes.
A password-protected stage (for example staging behind HTTP Basic auth) needs the
repo or environment secret `STAGEDIRECTOR_BASIC_AUTH` (`user:password`) so the smoke
test can sign in and really check the pages. A 401 always fails: a page the test
could not open was not checked. Anything else fails too and triggers the Safety net. A project's own
script may also smoke-test (and exit `1`), which is fine.

## `status --json`

Prints a JSON array of `StageStatus` (see `src/lib/types.ts`), one per deployable
stage, and nothing else on stdout:

```json
[
  {"stageId": "staging", "commit": "9f2c…", "deployedAt": "2026-11-18T10:02:00Z",
   "deployedBy": "ryan", "behindBy": 0, "outOfSync": [], "pinned": false},
  {"stageId": "live", "commit": "41ab…", "deployedAt": "2026-11-10T09:00:00Z",
   "deployedBy": "ryan", "behindBy": 3, "outOfSync": [], "pinned": false}
]
```

- `commit` is what the **host** says is there (after rollbacks), `null` if unknown.
- `behindBy` = commits on the previous stage that this stage lacks (0 if unknown).
- `outOfSync` may be `[]`; the full list comes from `tools.syncCheck`.
- `pinned` is always `false` here. Pins live in GitHub (below); the data layer overrides it.

The data layer may treat GitHub Deployments as the main source and use
`status --json` to spot hosts changed outside Stage Director.

## `tools.syncCheck` (drift)

Prints one changed path per line (files git put on the host that now differ or are
missing there). Empty output = in sync. Exit `0` either way; `2` if it cannot tell.

## `tools.snapshot` (Save a backup)

A full backup of one stage as it is now, started by the dashboard's **Save a backup**
(`action: snapshot`). `{stage}` is filled in. Same who-may rules as a deploy into that stage
(code owners for live), but no approval and allowed while pinned, because it changes nothing
on the site. Exit `0` only when the backup is stored off the host; print one line
`STAGEDIRECTOR_SNAPSHOT=<id>` naming it. Example (WordPress with UpdraftPlus to Backblaze):
`scripts/deploy.sh backup {stage}` running `wp updraftplus backup --send-to-cloud`.

## `tools.clearCache`

Clears the stage's caches (`STAGEDIRECTOR_STAGE`). Idempotent. Failure is reported
but does not fail a deploy.

## No-downtime switch (`noDowntime: true`)

Optional. With `noDowntime: true` in `stagedirector.yml` the workflow sets
`STAGEDIRECTOR_NO_DOWNTIME=1`, and a deploy command that supports it works with
**release folders and one atomic switch** instead of copying over the running site:

```
<base>/releases/<release id>/   one complete copy per release (id = commit sha or timestamp)
<base>/current -> releases/<id> the site serves from this symlink
```

1. **Prepare** the new release in its own folder while the old one keeps serving:
   copy or check out the files, install dependencies, build images. Nothing visible changes.
2. Print `STAGEDIRECTOR_BACKUP=<id of the release now in current>`. The backup *is* the
   previous release folder; no copy is needed.
3. **Switch** in one step: `ln -sfn releases/<new> current.tmp && mv -T current.tmp current`
   (a rename is atomic, so a request sees either the old or the new release, never a mix).
   Then reload what needs it (PHP-FPM/OPcache reload, `docker compose up -d` without a build).
4. Smoke test as usual. On failure the Safety net calls `rollback <stage> <backup>`.

`rollback <stage> <id>` with no-downtime = point `current` back at `releases/<id>` (same
atomic rename) and reload. This is the **instant undo**: seconds, no copying, no rebuild.

Rules:
- Shared data never lives in a release folder: uploads, `.env`, caches, databases are
  outside and linked in (e.g. `releases/<id>/wp-content/uploads -> ../../shared/uploads`).
- Keep at least the current and the previous release (the kit keeps 5). Never delete the
  folder `current` points to or the newest backup id.
- A host that can't do it (no symlinks, a web root that must be a real folder) ignores the
  flag and deploys the normal way. The deploy should print one line saying so.
- Database migrations are not undone by the switch. A change that needs one should either
  be backwards compatible or not use the instant undo.

The SSH-compose kit (`engine/kits/ssh-compose`) supports this with `NO_DOWNTIME=true` in its
host `.env`: each release is a `git worktree` under `RELEASES_DIR`, images are built
before the switch, and `up -d` then only swaps containers (a few seconds per changed
container, not the whole build). Undo needs no rebuild.

## Approval file (non-interactive live)

For `deploy` and `rollback` into a `pushers: code-owners` stage the workflow writes
a JSON file (mode 600, deleted at the end of the job) and sets
`STAGEDIRECTOR_APPROVAL` to its path:

```json
{
  "version": 1,
  "repo": "owner/name",
  "stageId": "live",
  "commit": "<full sha>",
  "action": "deploy",
  "by": "<code owner who approved; for rollback, the code owner who pressed Undo>",
  "at": "<ISO time of the approval>",
  "actor": "<github.actor>",
  "requestedBy": "<requested_by input>",
  "runUrl": "https://github.com/…/actions/runs/…",
  "expiresAt": "<now + timeoutMinutes + 15 min, ISO UTC>"
}
```

A deploy script that normally insists on a terminal for live may skip the prompt
**only** when all hold, and must refuse otherwise:

- `GITHUB_ACTIONS=true` and the file exists;
- `version == 1`, `stageId` is its live stage, `action` matches what it is doing
  (a `deploy` approval also allows `rollback`, so the Safety net can undo that deploy);
- for `deploy`, `commit` equals `git rev-parse HEAD`;
- `by` is non-empty, does not start with `claude:`, does not end in `[bot]`;
- `requestedBy` does not start with `claude:`;
- `expiresAt` is in the future.

The file is a hand-over, not the lock: anyone with a shell on the runner could write
one. The real locks are the workflow's checks plus the GitHub Environment holding
the host key (next section). Keep every safety check the script already has
(branch rule, staged-first, lint, backups). Anything that normally asks a person to
confirm something unusual (e.g. overwriting edits made on the server) should refuse
(exit `2`) without a terminal.

## Live gate (what the workflow checks)

In order; the first failure stops the run with a plain-English reason in the run
summary. All policy is read from `stagedirector.yml` and `CODEOWNERS` on the
**default branch**, never from the commit being moved.

1. **Dispatch from the default branch.** A run started on another ref is refused.
2. **Inputs valid.** Stage id in config, 40-char SHA present in the repo, action one of
   `deploy|rollback|pin|unpin|clear-cache`.
3. **Who.**
   - `pushers: none` → always refused.
   - `developers` → `github.actor` has write/maintain/admin.
   - `code-owners` → only `workflow_dispatch` (never on push); `github.actor` **and**
     `github.triggering_actor` are listed on the `*` line of CODEOWNERS (teams
     expanded), are not bots; `requested_by` does not start with `claude:`.
     So the dashboard must start live runs with the **person's own** GitHub token.
4. **Pinned.** `refs/stagedirector/pins/<stage>` exists → deploy/rollback refused.
   `pin` creates/moves that ref to the commit; `unpin` deletes it. Same "who" rules.
5. **Approval of this exact commit** (deploy into code-owners stage). The newest commit
   status with context `stagedirector/approval/<stage>` on the commit must be
   `success`, its `creator` (recorded by GitHub, cannot be faked by the caller) must be a
   code owner and a person, and its description must not start with `claude:`. A later
   status with another state (e.g. `error`, "approval withdrawn") cancels it.
   The dashboard records an approval by calling
   `POST /repos/{o}/{r}/statuses/{sha}` **with the code owner's own token**:
   `{"state":"success","context":"stagedirector/approval/live","description":"Approved by <login>"}`.
   The workflow token cannot pass: its creator is `github-actions[bot]`.
6. **Strict order** (deploy). The nearest earlier stage with a `deploy` command must be
   on this commit: its newest GitHub Deployment whose newest status is `success` has
   `sha == commit`.
7. **Environment lock.** The run job uses GitHub Environment `stagedirector-<stage>`.
   The host SSH key is a secret of that environment only. Configure:
   - Deployment branches: **default branch only** (so an edited copy of this workflow
     on a branch never gets the key).
   - For live: **Required reviewers** = the code owners, and *Prevent self-review* off
     if the approver is also the one pressing the button. The dashboard can submit
     that review for the person (`POST …/actions/runs/{id}/pending_deployments` with
     their token), so it stays one press.
   Plan check (2026-11-18): netdevs-net is a personal account on **GitHub Pro**. Per
   GitHub's docs, Pro gives private repos environments, environment secrets and
   deployment-branch rules, but **not required reviewers** (Enterprise only for private
   repos). Not tested by creating one. So for Meru and Maria's Place the live lock is
   step 5 (code-owner approval record) + environment secrets limited to `main`.
   Separate keys per stage keep the live key out of staging jobs.
8. Branch protection on the default branch, with CODEOWNERS review required for
   `CODEOWNERS`, `stagedirector.yml` and `.github/workflows/`, is what makes 1–7 hold.
   Set it up.

### Known limit: tools signed in as a code owner

The approval check trusts GitHub's record of **who created** the commit status. It cannot tell a
person pressing Approve from any program using that person's GitHub sign-in: `gh` on their computer,
a script, or an AI session running `gh` as them. Such a tool can create
`stagedirector/approval/<stage>` itself and then start the run, and every check passes. The
`claude:` description check only stops sessions that say who they are.

What closes it (the owner chooses):
- **Separate sign-in for agents**: AI sessions and scripts use a fine-grained token (or a separate
  account) **without** "Commit statuses: write" and "Actions: write" on project repos. Then only the
  person, through the dashboard, can approve or start a run.
- **A local guard**: a Claude Code `PreToolUse` hook that refuses commands which create an approval
  status, start a live release or run a live deploy (Loquio has one as a proposal:
  `docs/proposals/stagedirector-approval-guard.py`). Cheap, but only covers Claude Code's shell.
- **Required reviewers** on `stagedirector-live`: not available for private repos below Enterprise,
  and a review can also be submitted through the API with the same sign-in, so not enough alone.

## Records the dashboard reads

- **GitHub Deployments** (`environment` = stage id): one per deploy, `ref` = commit,
  `payload` = `{requestedBy, approvedBy, runUrl}`. Statuses: `in_progress` →
  `success` (description has `backup=<id>`) | `failure` (refused, or failed and rolled
  back) | `error` (failed and NOT rolled back: check the site) | `inactive` (undone by a
  later rollback). `auto_inactive` is off, so **"what is on a stage" = the newest
  deployment whose newest status is `success`.**
- **Commit statuses** `stagedirector/approval/<stage>`: approvals.
- **Refs** `refs/stagedirector/pins/<stage>`: pins.
- **Workflow runs** (name "Stage Director"): busy state, logs, history. A run's
  summary says who, what and why it was refused.
- GitHub keeps only one *pending* run per concurrency group (per repo). A third press
  while one runs and one waits replaces the waiting one; the UI should show "busy".

## Limits in this version

- A push deploys only the **first** `trigger: auto` stage.
- Live takes what Maria's Place's script allows (only `origin/main` tip). If `main`
  moves after approval, approve the new tip.
- Custom refs for pins: if GitHub refuses `refs/stagedirector/...` for a repo, switch
  to tags `stagedirector-pin-<stage>` (two lines in the workflow).

## Outside deploys

Sometimes a stage is deployed without Stage Director (e.g. `scripts/deploy.sh staging`
from a terminal). So the dashboard still shows what each stage really runs:

1. **Version marker.** Every deploy (inside or outside Stage Director) writes the full
   commit SHA to `.stagedirector-version` in the site's web root, e.g.
   `git rev-parse HEAD > "$WEBROOT/.stagedirector-version"`. It must be served at
   `<stage url>/.stagedirector-version`. (It reveals only the commit id.)
2. **Report from the terminal** (instant): at the end of the deploy script, call
   `engine/kits/report-deploy.sh <stage>` (copy it into the project). It does nothing
   inside a Stage Director run (`STAGEDIRECTOR=1`) and never fails the deploy.
3. **Version check** (catches everything else): `engine/workflow/stagedirector-observe.yml`
   reads the markers every 30 minutes.

Both write GitHub Deployments in environment `observed-<stage>`. These are **display
only**: the live gate reads `environment=<stage>` and never these, so a deploy made
outside Stage Director can not unlock a push to live. To put such a commit live, push
it through Stage Director (staging first, then the usual code-owner approval).

## Run progress file (self-hosted runner on the dashboard's machine)

When the runner's environment sets `STAGEDIRECTOR_PROGRESS_DIR` (the compose file sets it to
`/home/runner/progress`, mounted from `STAGEDIRECTOR_PROGRESS_HOST_DIR`, default `./progress`),
the workflow's "Note progress on this machine" steps append one JSON line per step to
`<dir>/<owner>~<repo>.jsonl`:

```json
{"run":123,"repo":"netdevs-net/mariasplace","stage":"staging","commit":"…","action":"deploy","by":"ryan","state":"running","step":2,"at":"…","url":"…"}
```

`step` is the dashboard's plain step (0 checking, 2 copying, 3 checking the site); `state` is
`running`, then `passed` / `failed` / `stopped`. A dashboard on the same machine reads the folder
(`STAGEDIRECTOR_RUNNER_PROGRESS=<host dir>`) and follows the run without API calls. Display only:
GitHub stays the record, and is asked once when the run ends. Create the host folder before
starting the runner so the runner user can write to it (`mkdir -p progress && chmod 777 progress`).
