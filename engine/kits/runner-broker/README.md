# Runner + deploy broker: quiet, pull-only deploys on the host

> **Written and linted, not run.** Nothing here is installed on any server.

GitHub never reaches into the host. The host asks GitHub for work, runs each job in a fresh
container, and that container can only ask a local broker to deploy one stage.

```
timer (every 20 s) ─▶ stagedirector-runner-dispatch <instance>
   one HTTPS call: any queued job for my label?   no ─▶ exit (nothing stays running)
                                                  yes ─▶ single-use JIT config from GitHub
   ─▶ docker compose run --rm runner   (ephemeral: one job, then the container is removed)
        job ─▶ deploy/stagedirector.sh ─▶ /run/stagedirector/<instance>.sock
   ─▶ systemd starts sd-broker-<instance>@ for that one connection
        ─▶ stagedirector-remote <project> <stage>   (deploy <sha> | rollback <id> | status)
        ─▶ docker compose -p <stage project> ...    (only the broker can do this)
```

## How quiet it is

| | Idle | During a job |
|---|---|---|
| Processes | none (a timer and a socket held by systemd) | one runner container + one broker |
| Network | 1 outbound HTTPS call per 20 s per instance (~180/h, under 4% of the token's 5000/h) | runner talks to GitHub |
| Memory | 0 | runner capped at `RUNNER_MEMORY` (900 MB default), dispatcher at 64 MB |
| Priority | dispatcher at `Nice=15`, idle I/O class, `CPUWeight=20` | runner at `nice 10`, idle I/O |
| Logs | nothing on an empty tick; journal rate-limited | one line at start and end (`journalctl -t stagedirector-runner`) |

A job starts within about 20–30 s of the click (tick + container start; the image is pre-built).

## Why it is safe

- **No inbound door.** No deploy port, no deploy SSH keys in GitHub. Tailscale SSH stays for people.
- **Fresh runner per job.** JIT runners are registered for one job and removed; nothing a job
  leaves behind reaches the next.
- **The runner cannot touch Docker.** No Docker socket in the container. Its only door is the
  stage's broker socket (group `sd-<instance>`), which accepts one short line and refuses anything
  but `deploy <sha> [login]`, `rollback <id>` or `status`. Project and stage come from the unit
  name, never from the caller.
- **Staging and live are separate.** Own label, own socket, own group, own dispatcher. The live
  runner only exists when a gated live job is queued.
- **The GitHub token stays on the host** (root-only file); the container only gets the
  single-use JIT config. Token: fine-grained, this repo only, Administration: write (to make JIT
  runners) and Actions: read.
- In GitHub, put the runners in a runner group limited to this repo and the
  `.github/workflows/stagedirector.yml` workflow (Settings > Actions > Runner groups; needs an
  organization plan with runner groups, otherwise the Default group).

Private repos only: never point self-hosted runners at a public repo (fork PRs could run code).

## Install (owner, by hand, per instance; example `meru-staging`)

```bash
I=meru-staging
sudo groupadd --system "sd-$I"; getent group "sd-$I"       # note the gid for BROKER_GID
sudo install -m 755 stagedirector-broker stagedirector-runner-dispatch /usr/local/bin/
sudo install -m 755 ../ssh-compose/stagedirector-remote /usr/local/bin/   # plus its /etc/stagedirector/<project>-<stage>.env
sed "s/INSTANCE/$I/g" broker.socket.in   | sudo tee /etc/systemd/system/sd-broker-$I.socket
sed "s/INSTANCE/$I/g" broker@.service.in | sudo tee /etc/systemd/system/sd-broker-$I@.service
sudo install -m 644 dispatch@.service dispatch@.timer -t /etc/systemd/system/ \
  && sudo mv /etc/systemd/system/dispatch@.service /etc/systemd/system/stagedirector-dispatch@.service \
  && sudo mv /etc/systemd/system/dispatch@.timer /etc/systemd/system/stagedirector-dispatch@.timer
sudoedit /etc/stagedirector/runner-$I.env                 # see the header of stagedirector-runner-dispatch
sudo install -m 600 /dev/null /etc/stagedirector/runner-$I.token && sudoedit /etc/stagedirector/runner-$I.token
(cd /opt/stagedirector/compose && sudo docker compose -f docker-compose.ephemeral.yml build)
sudo systemctl daemon-reload
sudo systemctl enable --now sd-broker-$I.socket stagedirector-dispatch@$I.timer
```

The deploy user `stagedirector` owns the stage's checkout and is in the `docker` group; it has
no login shell use beyond the broker. Nobody else joins `sd-<instance>`.

## Check before the first real deploy

```bash
echo status | sudo -u stagedirector socat - UNIX-CONNECT:/run/stagedirector/meru-staging.sock   # JSON + STAGEDIRECTOR_EXIT=0
echo 'id; sh' | sudo socat - UNIX-CONNECT:/run/stagedirector/meru-staging.sock                   # refused, EXIT=2
systemctl list-timers 'stagedirector-dispatch@*'
journalctl -t stagedirector-runner -t stagedirector-broker --since today
```

Then press Deploy for staging in the dashboard and watch a runner appear in
repo Settings > Actions > Runners, take the job, and disappear.

## Save GitHub-hosted minutes on "Check rules" too (optional)

Each run has two jobs: "Check rules" (the gate) and the deploy job. The deploy job already runs
here. The gate is GitHub-hosted by default; each one is billed as at least one minute on private
repos. To run it here as well:

1. Add a dispatcher instance `sd-gate` with `LABEL=sd-gate` and **no** `BROKER_SOCKET` (it gets no
   deploy door; it only reads the repo and GitHub's records).
2. In the project's `stagedirector.yml`: `gateRunner: self-hosted` (the dashboard passes it on
   every button press). For runs started by a push, also set the repo variable
   `STAGEDIRECTOR_GATE_RUNNER=self-hosted`.

The workflow fixes the label to `sd-gate`, so nobody can send the gate to a stage's deploy runner.
Trade-off: the live approval check then runs on your host, so that host must be trusted as much as
GitHub's own runners. If the `sd-gate` runner is down, runs wait in GitHub's queue; switch back with
`gateRunner: github`.
