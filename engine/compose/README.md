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
- **No Docker socket by default.** A job that can reach it is root on the host. Prefer the forced-command SSH kit (`../kits/ssh-compose/`) instead. Only if a
  project really must run `docker compose` from a runner on its own host, add the overlay:
  ```bash
  docker compose -f docker-compose.yml -f docker-socket.yml up -d
  ```
  and give that runner its own label so only that project uses it.
- Host keys never live on the box; the workflow loads them from the GitHub Environment
  (default branch only, live after a code-owner review).

## Health and restarts

`restart: unless-stopped` brings the runner back after a crash or reboot. The compose file also
has a **healthcheck**: the container is `healthy` while the runner's `Runner.Listener` process is
alive (`docker compose ps` shows it). Docker does not restart an unhealthy container by itself;
`engine/runner/watchdog.sh` does that, and also restarts it when GitHub lists the runner as
offline. Setup steps (by hand, on the host): `engine/runner/README.md` → "Watchdog".

## Common commands

| | |
|---|---|
| Update tools / runner | bump `RUNNER_VERSION` / `WRANGLER_VERSION` in `.env`, then `docker compose up -d --build` |
| Stop | `docker compose down` (keeps registration) |
| Remove completely | in GitHub remove the runner, then `docker compose -p <COMPOSE_PROJECT_NAME> down -v` (always name the project) |

## Troubleshooting (seen in real setups)

| Symptom | Cause | Fix |
|---|---|---|
| Runs stay *Queued* for hours; the dashboard says "Waiting for a runner" | No online runner carries the stage's `runner:` label | `docker compose ps` / `logs runner`, then `up -d`; set up the watchdog so it heals itself |
| `config.sh` fails with `404 (Not Found)` at `GetTenantCredential`, even with a fresh token | GitHub refuses runners that are too old | Set `RUNNER_VERSION` to a current release ([releases](https://github.com/actions/runner/releases)), then `docker compose up -d --build` |
| Build hangs at the first `apt-get update` (ovh1) | `archive.ubuntu.com` / `security.ubuntu.com` time out from OVH | `APT_MIRROR=http://ubuntu.mirrors.ovh.net/ubuntu/` in `.env`, rebuild |
| `all predefined address pools have been fully subnetted` | The host's Docker has no free network ranges (many projects) | Don't delete other projects' networks. Add `docker-compose.override.yml` with `services: {runner: {network_mode: bridge}}` so the runner uses Docker's default bridge |
| A job on a runner reaches its own host over SSH but gets `Connection refused` / timeout (ovh1) | `ufw` allows SSH only on `tailscale0` | Allow the runner's Docker bridge to the host's tailnet address on port 22 (one `ufw allow from <bridge subnet> to <tailnet ip> port 22` rule) |
| A forced-command key (`kits/ssh-compose`) is ignored and you get a shell or "permission denied" | **Tailscale SSH** answers tailnet peers itself and ignores `authorized_keys` (forced commands included) | Reach `sshd` from a non-tailnet source, or turn Tailscale SSH off for that host. Never rely on the forced command when Tailscale SSH is on |

## Per project

| Project | How it deploys | Bundle needed? |
|---|---|---|
| **Meru** (priority) | GitHub-hosted job → Tailscale → forced-command SSH → `stagedirector-remote` on vultr1. Staging next to live as its own Compose project. | **No.** No runner on vultr1 (a runner there could change live). See `../examples/meru/` and `../kits/ssh-compose/`. |
| Maria's Place | self-hosted runner on ovh1 → SSH to Hostinger (`scripts/deploy.sh`) | Yes, this bundle (or `../runner/setup-ovh1.sh`), without the Docker socket. Work flows local `main` → staging → live. |

Wrangler (Cloudflare Workers/Pages) deploys run fine on GitHub-hosted jobs too
(`runner: github`); keep separate staging and live Cloudflare tokens as environment secrets.
