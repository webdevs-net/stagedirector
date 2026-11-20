# Stage Director: setup and internals

Back to the [overview](../README.md).

## How it works

```
 Dashboard (Next.js)  ──starts──▶  GitHub Actions workflow  ──runs on──▶  self-hosted runner (ovh1)
        ▲                               │  checks the rules                    │ SSH, key from a
        └──── reads status, history ────┘  records Deployments                 ▼ GitHub Environment
                                                                     project's own deploy script → host
```

- **The dashboard never talks to hosting.** Its buttons start GitHub workflow runs; status, logs and history come from the GitHub API.
- **The engine** ([`engine/`](../engine/)) is one workflow each project copies, plus the project's own deploy script. Before anything moves, the workflow checks who is asking, whether this exact commit is approved by a code owner, whether the previous stage is on that commit, and whether the stage is pinned. The host's SSH key lives only in a GitHub Environment that releases it only to runs from the main branch, with a separate key per stage.
- **The live lock** is two things together: a recorded approval of that exact commit by a person listed in `CODEOWNERS` (checked inside the workflow; bots and AI sessions can't pass), and live secrets that only `main` can use. On the current GitHub Pro plan with private repos, GitHub Environments can't require a reviewer. GitHub Enterprise, or a public repo, would add Environment required reviewers as a third lock. Details: [deploy contract](../engine/contract.md#live-gate-what-the-workflow-checks).
- **Each project** has a `stagedirector.yml` describing its stages ([example](../examples/mariasplace.stagedirector.yml)) and a deploy command that follows the [deploy contract](../engine/contract.md).

| Where | What |
|---|---|
| [`src/app`](../src/app), [`src/components`](../src/components) | Screens |
| [`src/lib/github`](../src/lib/github), [`src/lib/auth`](../src/lib/auth) | GitHub data layer, sign-in, roles |
| [`src/lib/types.ts`](../src/lib/types.ts) | Shared types |
| [`engine/workflow`](../engine/workflow) | The workflow and live gate |
| [`engine/contract.md`](../engine/contract.md) | What a project's deploy command must do |
| [`engine/runner`](../engine/runner) | Runner setup for ovh1 (for the owner to run by hand) |

## Run it locally

```bash
npm install
```

```bash
STAGEDIRECTOR_DEV_LOGIN=your-login npm run dev
```

Without GitHub credentials it runs on **sample data** (what the screenshots show), and every button can be tried. To use real projects, copy `.env.example` to `.env.local` and fill in the GitHub OAuth app, a GitHub App or token, and `STAGEDIRECTOR_REPOS`.

## Tests

```bash
npm test
```

Unit tests, plus **GitHub mode end to end against a fake GitHub API**
(`src/lib/github/testing/fake-github.ts`): reading stages, starting and following runs, Stop,
pins, approvals, Claude requests, forged log records. The fake also plays the engine's workflow.

```bash
npx playwright install chromium
```

```bash
npm run e2e
```

Browser tests (`e2e/`): every screen and button in demo mode, phone-width layout, and GitHub mode
(a second dev server pointed at the fake GitHub, signed in as a code owner). CI runs all of it on
every pull request (`.github/workflows/ci.yml`); no secrets needed.

## Run it on ovh1 (Docker, Tailscale only)

Written for the owner to run by hand; nothing here has been run against the server.
The dashboard listens on `127.0.0.1:3100` only and `tailscale serve` publishes it to
the tailnet with HTTPS. No public port, no public DNS, no inbound webhooks.

1. **Get the code on ovh1** (as the deploy user):

   ```bash
   git clone https://github.com/netdevs-net/stagedirector.git ~/stagedirector
   ```

2. **Fill in the settings.** `deploy/.env.example` lists every variable. The OAuth
   client secret, `AUTH_SECRET` and the GitHub App key are typed in by the owner only.

   ```bash
   cd ~/stagedirector/deploy && cp .env.example .env && chmod 600 .env
   ```

3. **Start it.** Dashboard only:

   ```bash
   docker compose up -d --build
   ```

   Or the dashboard and the self-hosted runner together (needs `engine/compose/.env`, see
   [engine/compose/README.md](../engine/compose/README.md)):

   ```bash
   docker compose -f docker-compose.yml -f with-runner.yml up -d --build
   ```

4. **Check it is healthy** (Docker's healthcheck calls the same URL every 30 s):

   ```bash
   curl -s http://127.0.0.1:3100/api/health
   ```

5. **Publish it on the tailnet** with Tailscale's own HTTPS certificate:

   ```bash
   sudo tailscale serve --bg --https=443 http://127.0.0.1:3100
   ```

   Then open `https://<ovh1's tailnet name>/`. To use `stagedirector.webdevs.net` instead,
   point a DNS record at ovh1's **tailnet** IP (100.x) and use a DNS-challenge certificate;
   set `AUTH_URL` to whichever address people use, and add it to the OAuth app's callbacks.
   Never use `tailscale funnel` (that would make it public).

6. **Update later:** `git pull && docker compose up -d --build` in `deploy/`.

The container runs as an unprivileged user with a read-only file system, no Linux
capabilities, and memory/CPU caps (`DASHBOARD_MEMORY`, `DASHBOARD_CPUS`).

## Adding a project

1. Add `stagedirector.yml` to the project's repo ([example](../examples/mariasplace.stagedirector.yml)).
2. Copy [`engine/workflow/stagedirector.yml`](../engine/workflow/stagedirector.yml) to `.github/workflows/`.
3. Make the deploy script follow the [contract](../engine/contract.md).
4. Add a `CODEOWNERS` file, protect `main`, and create the `stagedirector-<stage>` environments ([runner guide](../engine/runner/README.md)).

## Live updates and local mode

- Pages re-read GitHub every 15 s while visible, on window focus and right after a button
  press ("Updated Xs ago", top right). GET requests send `If-None-Match`; unchanged answers
  come back as 304 and do not use rate limit (`src/lib/github/etag.ts`).
- **Local mode**: when the dashboard is opened at `localhost`, a project page shows the
  local checkout's uncommitted files and unpushed commits, with the push command to copy.
  Map repos to folders in `stagedirector.local.json` (git-ignored; see
  `stagedirector.local.example.json`) or `STAGEDIRECTOR_LOCAL_PATHS="owner/repo=/path"`.
  Read-only: it never commits or pushes.
- **Outside deploys** (e.g. `scripts/deploy.sh staging` from a terminal): see
  `engine/contract.md` "Outside deploys". Display only; the live gate is unchanged.

## GitHub budget (gateway)

Every GitHub REST call goes through `src/lib/github/gateway.ts`: counted per endpoint and
caller, one ETag cache (304s are free), identical in-flight GETs shared, background calls
capped at `STAGEDIRECTOR_GITHUB_PER_MINUTE` (default 5) with a burst for a cold start, and
paused when GitHub's hourly budget is under 100. Button presses are never capped. See `/usage`.

Git facts come from a local copy kept with `git fetch` (not REST): `.stagedirector-cache/repos`.
A runner on the same machine can report run progress through a local file (engine/contract.md).
Use a GitHub App or `STAGEDIRECTOR_GITHUB_TOKEN` so the dashboard has its own hourly limit.
