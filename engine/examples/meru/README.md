# Meru on Stage Director (priority target)

> **Written and linted, not run.** Nothing here has touched vultr1, Cloudflare or GitHub settings.
> Files here are copies to drop into the Meru repo through a PR, plus host files the owner installs.

Meru staging is where changes are previewed before production. It runs **next to live on
vultr1**, as its own Compose project, and sends mail the same way live does, but only to test
contacts.

## How a deploy reaches vultr1

```
Stage Director button ─▶ workflow (GitHub-hosted, runner: github)
   ─▶ joins the tailnet (TS_OAUTH_* environment secrets)
   ─▶ ssh with the stage's forced-command key (STAGEDIRECTOR_SSH_KEY)
   ─▶ /usr/local/bin/stagedirector-remote meru <stage>    (fixed by the key, not the caller)
        guard ─▶ git checkout <sha> ─▶ docker compose -p <project> up -d --build ─▶ health ─▶ auto-rollback
```

No runner lives on vultr1 and no job gets the Docker socket, so a job can only ask for
`deploy <sha>`, `rollback <id>` or `status` of the one stage its key belongs to. This follows
Meru's existing pattern (`.github/workflows/deploy.yml` → Tailscale → `remote-deploy.sh`), which
stays switched off.

## Staging, isolated from live

| | Live | Staging |
|---|---|---|
| Compose project | `meru-pipeline` (+ `meru-mautic…`) | `meru-pipeline-staging` (+ `meru-mautic-staging`) |
| Containers, named volumes | live's | prefixed `meru-pipeline-staging_` |
| Network | `meru-mautic-local_default` | `meru-mautic-staging_default` |
| Ports (127.0.0.1) | 58088, 58095 | 58188, 58195 |
| sendgw registry | `/opt/meru-pipeline/sendgw` | `/opt/meru-staging/sendgw` (own `domains.json`, small `daily_cap`) |
| Cloudflare KV namespace, token | live's | own namespace, staging-only token |
| Mailgun webhook | live's | own webhook + signing key |
| Caps | none set | 384 MB / 0.5 CPU per service |
| Backups | yes | excluded (label `backup.exclude=true`) |

`stagedirector-remote` refuses any project listed in `PROTECTED_PROJECTS` (live's), never runs
`down`, and always passes `-p`. **Never run `docker compose down -v` without `-p meru-pipeline-staging`.**

## Mail on staging (owner: "test contacts only")

- **Same path as live:** sendgw → Mailgun/Gmail, so a staging test is a real test.
- **Only test contacts:** staging Mautic holds only owner test addresses. Any copy from live runs
  `scrub-mautic-contacts.sql` first.
- **Recipient allowlist:** `GATEWAY_RECIPIENT_ALLOWLIST` (already in sendgw) is required by the
  override. sendgw parks and logs mail to anyone else.
- **Small daily cap:** staging's own `domains.json`; the guard refuses caps above 25 (`STAGING_DAILY_CAP_MAX`).
- **Tagged:** `X-Stage: staging` header and `[STAGING] ` subject prefix. **Not in sendgw yet**:
  Meru work item `GATEWAY_STAGE_TAG`, needed before staging's first send.
- **Mautic cron off by default** on staging (give it a Compose `profiles: [cron]`).
- `meru-staging-mail-guard` runs on the host before every staging deploy and refuses when any of
  this is not true.

## Files

| File | Goes to |
|---|---|
| `stagedirector.yml` | Meru repo root |
| `stagedirector.sh` | Meru `deploy/stagedirector.sh` |
| `docker-compose.staging.yml` | Meru `deploy/vultr1/docker-compose.staging.yml` |
| `staging.env.example` | vultr1 `/opt/meru-staging/.env` (filled, never committed) |
| `meru-staging-mail-guard` | vultr1 `/usr/local/bin/` |
| `scrub-mautic-contacts.sql` | run on staging Mautic after any copy from live |
| `../../kits/ssh-compose/stagedirector-remote` | vultr1 `/usr/local/bin/` |
| `../../kits/ssh-compose/example.env` | vultr1 `/etc/stagedirector/meru-staging.env` |

## Owner steps (by hand)

1. **vultr1:** make `/opt/meru-staging/{repo,sendgw}`, clone Meru into `repo` with a read-only
   GitHub deploy key, copy live's `domains.json` into `sendgw/` and lower every `daily_cap`, fill
   `/opt/meru-staging/.env`, install `stagedirector-remote` and the guard, write
   `/etc/stagedirector/meru-staging.env`.
2. **Staging Mautic:** a separate `meru-mautic-staging` project with its own database, cron off,
   test contacts only.
3. **Keys:** one ed25519 key per stage. On vultr1, for the deploy user's `authorized_keys`:
   `command="/usr/local/bin/stagedirector-remote meru staging",restrict ssh-ed25519 …`
   (and a separate `… meru live` line later). Private keys go to GitHub only.
4. **GitHub (Meru repo):** environments `stagedirector-staging` / `stagedirector-live`, deployment
   branch `main`. Secrets per environment: `STAGEDIRECTOR_SSH_KEY`, `TS_OAUTH_CLIENT_ID`,
   `TS_OAUTH_SECRET`, `CLOUDFLARE_API_TOKEN` (staging token on staging only); variable
   `STAGEDIRECTOR_KNOWN_HOSTS` (vultr1's host key line).
5. **Cloudflare:** staging KV namespace, staging Worker/Pages names, staging-only API token;
   staging Mailgun webhook pointing at staging's endpoint.

## Still open (owner)

- Staging hostname, and Cloudflare Access in front of it.
- Test address pattern for the guard (`MERU_TEST_ADDRESS_RE`) and the allowlist.
- The Mautic non-test-contact check command (`MERU_STAGING_CONTACT_CHECK`).
- Meru code: `GATEWAY_STAGE_TAG` in sendgw; a cron profile for staging Mautic; whether the
  backup job honours `backup.exclude`.
