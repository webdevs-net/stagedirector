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
