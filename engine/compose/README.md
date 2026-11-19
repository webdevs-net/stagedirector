# Engine bundle (Docker Compose)

> **Written and linted, not run.** Nothing here has been started on ovh1, vultr1, Hostinger
> or Cloudflare. The owner brings it up by hand.

One folder that runs a Stage Director runner on **any Docker host**: the official GitHub
Actions runner plus the tools deploy commands need: `ssh`, `rsync`, `git`, `jq`, `gh`,
Node + **Wrangler** (Cloudflare Workers/Pages) and the Docker CLI.

Portable by design:

- Nothing host- or site-specific is in the files. Everything comes from `.env` (and `ssh/`).
- One command brings it up; running it again is safe (registration is kept in a volume).
- Another project or another host = another copy of this folder (or another `.env`) with its
  own `COMPOSE_PROJECT_NAME`. No code changes.

## Set up (4 steps)

1. Copy this folder to the host and make the env file:
   ```bash
   cp .env.example .env
   ```
2. In `.env` set `COMPOSE_PROJECT_NAME`, `GITHUB_URL`, `RUNNER_NAME`, `RUNNER_LABELS` (must
   include the `runner:` label from the project's `stagedirector.yml`), and paste a
   registration token into `RUNNER_TOKEN` (repo > Settings > Actions > Runners > New
   self-hosted runner).
3. Add host aliases: `cp ssh/config.example ssh/config`, fill it in, and put the hosts' keys
   in `ssh/known_hosts` (`ssh-keyscan -p <port> <host> > ssh/known_hosts`, then check the
   fingerprint against the host's panel). No private keys here.
4. Start it, then delete `RUNNER_TOKEN` from `.env` once the log says *registered*:
   ```bash
   docker compose up -d --build && docker compose logs -f runner
   ```

Then in GitHub (once per project): create environments `stagedirector-staging` and
`stagedirector-live` (deployment branch `main`; live with code owners as required reviewers)
and add their secrets:

| Secret (per environment) | For |
|---|---|
| `STAGEDIRECTOR_SSH_KEY` | private key for that stage's host (public half on the host) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | projects that run `wrangler deploy`; use a staging-only token on staging |
| `STAGEDIRECTOR_BASIC_AUTH` | optional, `user:password` for password-protected staging smoke tests |

Copy `../workflow/stagedirector.yml` into the project as `.github/workflows/stagedirector.yml`.

## Safety

- Runs as the `runner` user. The base image puts it in `sudo`; `no-new-privileges` and
  dropping all capabilities block that (checked: sudo refuses). Never remove those two lines.
  Memory/CPU/PID caps (`RUNNER_MEMORY`, `RUNNER_CPUS`) so jobs can't starve the sites.
- **No Docker socket by default.** A job that can reach it is root on the host. Only for a
  project whose deploy runs `docker compose` on this same host, add the overlay:
  ```bash
  docker compose -f docker-compose.yml -f docker-socket.yml up -d
  ```
  and give that runner its own label so only that project uses it.
- Host keys never live on the box; the workflow loads them from the GitHub Environment
  (default branch only, live after a code-owner review).

## Common commands

| | |
|---|---|
| Update tools / runner | bump `RUNNER_VERSION` / `WRANGLER_VERSION` in `.env`, then `docker compose up -d --build` |
| Stop | `docker compose down` (keeps registration) |
| Remove completely | in GitHub remove the runner, then `docker compose down -v` |

## Per project

| Project | Host | Runner label | Notes |
|---|---|---|---|
| Maria's Place | ovh1 → Hostinger over SSH | `ovh1` | No Docker socket needed. Uses `scripts/deploy.sh` (see `../patches/`). |
| Meru | vultr1 (staging next to live) | `vultr1` | Needs `docker-socket.yml` (deploys `docker compose` on the same host) and the Cloudflare secrets. See `../examples/meru/`. |

### Meru: open decisions (placeholders)

- **Staging host name** and whether Cloudflare Access protects it: `<staging-host>` in
  `../examples/meru/stagedirector.yml`.
- **Staging mail**: catch-all (default suggestion: Mailpit, nothing leaves the box) or an
  allowlist of real addresses. Marked `MAIL DECISION` in
  `../examples/meru/docker-compose.staging.yml`.
- **Deploy script**: `deploy/stagedirector.sh` does not exist in Meru yet; it must follow
  `../contract.md` and use the compose project `meru-staging` for staging (own containers,
  volumes, networks and ports; caps per service), so staging can never touch live's data or
  the sendgw registry.
- Meru's existing `.github/workflows/deploy.yml` (off, `DEPLOY_ENABLED`) stays off; Stage
  Director's workflow replaces it once the above is decided.
