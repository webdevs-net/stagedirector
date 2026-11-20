# Runner on ovh1

> **Not run yet.** `setup-ovh1.sh` was written and linted, never executed. The owner
> reads it and runs it by hand, as root, on ovh1. Nothing here changes Hostinger.

ovh1 is Ubuntu with Docker, ~2 GB RAM free, and hosts other client sites. The runner:

- runs as its own system user `stagedirector-runner` (home `/srv/stagedirector`,
  locked password, **not** in `docker`/`sudo`/`adm`, so a job cannot get root);
- is a systemd service per repo with limits: `MemoryHigh=700M`, `MemoryMax=900M`,
  `CPUQuota=100%`, `TasksMax=256`, `IOWeight=50`, `Nice=10`, `NoNewPrivileges`,
  `ProtectSystem=full` (edit the top of the script to change);
- has labels `self-hosted,ovh1`;
- keeps **no host private keys on disk**. Each project host gets its own ed25519 key; the
  private half goes into the GitHub Environment secret `STAGEDIRECTOR_SSH_KEY` and is
  deleted from ovh1. Jobs get it only through the environment lock (default branch only;
  live also needs a code-owner review). `~/.ssh/config` has the host alias and
  `known_hosts` the host's key.

## Steps for Maria's Place

On your Mac:

1. Download `setup-ovh1.sh` to ovh1, e.g. `scp engine/runner/setup-ovh1.sh ovh1:/tmp/`.
2. In the script, set `RUNNER_VERSION` to the current release of
   https://github.com/actions/runner/releases and paste its linux-x64 sha256 into `RUNNER_SHA256`.

In GitHub (repo → Settings):

3. *Actions → Runners → New self-hosted runner* → copy the **registration token** (valid 1 h).
4. *Environments* → create `stagedirector-staging` and `stagedirector-live`:
   - Deployment branches and tags: **Selected → `main`** for both.
   - `stagedirector-live`: **Required reviewers** = code owners (needs public repo or a
     paid plan for private repos).
   - Optional `STAGEDIRECTOR_BASIC_AUTH` secret on staging (`user:password` of the staging
     Basic-auth) so smoke tests check real pages.
5. Branch protection on `main`: PRs required, *Require review from Code Owners*; make sure
   `CODEOWNERS` covers `/CODEOWNERS`, `/stagedirector.yml`, `/.github/workflows/`.

On ovh1 (as root):

```bash
sudo bash /tmp/setup-ovh1.sh runner <owner>/MariasPlace <registration-token>
```

```bash
sudo bash /tmp/setup-ovh1.sh hostkey mariasplace hostinger <hostinger-user>@<hostinger-host> 65002
```

Check the printed host-key fingerprint against hPanel. The script prints the public and
private key and waits for Enter.

On Hostinger (approve this yourself; it gives ovh1 access to both staging and live,
which share one Hostinger account):

6. hPanel → *Advanced → SSH Access → SSH keys → Add* → paste the **public** key.

Back in GitHub:

7. Paste the **private** key as `STAGEDIRECTOR_SSH_KEY` in **both** environments, then press
   Enter on ovh1 so the script deletes it there.
8. `sudo bash /tmp/setup-ovh1.sh status` → service active, limits shown. In GitHub the runner
   is *Idle* with labels `self-hosted, ovh1`.

Then apply the Maria's Place patch (`engine/patches/`), add
`.github/workflows/stagedirector.yml`, `stagedirector.yml` and `CODEOWNERS` to that
repo through a PR, and try a **staging** push first.

## When the runner is offline

Stage Director shows a coloured dot per runner on the home page ("Engines and servers") and a
banner on the project page when a stage's runner is offline. While it is offline, buttons for
that stage say so instead of starting a run that would wait forever. A run that sits queued for
more than ~3 minutes shows "Waiting for a runner" and can be stopped from the page.

To bring it back (by hand, on the runner's host):

1. Docker runner (`engine/compose`): `docker compose ps` → if not `healthy`, `docker compose up -d`;
   `docker compose logs --tail 50 runner` shows why it stopped.
2. Service runner (`setup-ovh1.sh`): `sudo ./svc.sh status` in the runner folder, then `sudo ./svc.sh start`.
3. If GitHub still lists it as *Offline* after a minute, its registration may be gone: remove it in
   GitHub (Settings → Actions → Runners) and register again with a fresh token.
4. A runner on a laptop or test Mac (e.g. `mac-test-mariasplace`) is offline whenever that machine
   sleeps; give each stage a `runner:` label that only an always-on runner carries.

Stage Director needs **Administration: read** on the repo (GitHub App permission) to see runner
status. Without it every runner shows "status unknown" and runs are allowed as before.

## Watchdog (self-healing, Docker runners)

`watchdog.sh` checks every ~2 minutes that the runner container is running and healthy (the
compose file has a healthcheck on the `Runner.Listener` process) and, if a token is set, that
GitHub lists the runner as online. If not, it restarts the container, waiting longer after each
failed attempt (2, 4, 8 … up to 30 minutes) and writing one log line each time
(`journalctl -t stagedirector-watchdog`). A missing container is only logged, never created.

Steps for the owner, run by hand on the host (nothing in this repo runs them):

```bash
sudo install -D -m 755 engine/runner/watchdog.sh /opt/stagedirector/watchdog.sh
sudo install -D -m 600 engine/runner/systemd/watchdog.env.example /etc/stagedirector/watchdog.env
sudo nano /etc/stagedirector/watchdog.env      # container name, repo, runner name, optional token
SD_DRY_RUN=1 sudo --preserve-env=SD_DRY_RUN bash -c 'set -a; . /etc/stagedirector/watchdog.env; /opt/stagedirector/watchdog.sh'   # try it: logs only
sudo cp engine/runner/systemd/stagedirector-watchdog.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now stagedirector-watchdog.timer
systemctl list-timers stagedirector-watchdog.timer
```

Cron instead of systemd: `*/2 * * * * root set -a; . /etc/stagedirector/watchdog.env; /opt/stagedirector/watchdog.sh >> /var/log/stagedirector-watchdog.log 2>&1`
in `/etc/cron.d/stagedirector-watchdog`.

Undo: `sudo systemctl disable --now stagedirector-watchdog.timer`, remove the two unit files,
`/opt/stagedirector/watchdog.sh`, `/etc/stagedirector/watchdog.env` and `/var/lib/stagedirector-watchdog`.

For a service runner (`setup-ovh1.sh`, no Docker), systemd already restarts the service when
it exits; the watchdog is for the Docker setup.

## Undo

```bash
cd /srv/stagedirector/runners/<owner>__<repo> && sudo ./svc.sh uninstall && sudo -u stagedirector-runner ./config.sh remove --token <removal-token>
```

Remove the key from hPanel and the environment secrets; `userdel -r stagedirector-runner`.

## Notes

- One runner per repo keeps registration simple. With many projects, an org-level runner
  (one service) is lighter on RAM; register it at the org with the same labels.
- Each job checks out into `/srv/stagedirector/runners/<repo>/_work`. Jobs run one at a time
  per runner.
- Docker is not used by jobs. If a project ever needs containers, give it a separate runner
  rather than adding this user to the `docker` group (that is root on the host).
