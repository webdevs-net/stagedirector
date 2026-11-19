# Meru on Stage Director (priority target)

> **Written and linted, not run.** Nothing here has touched vultr1, Cloudflare or GitHub settings.
> Files here are copies to drop into the Meru repo through a PR, plus host files the owner installs.

Meru staging is where changes are previewed before production. It runs **next to live on
vultr1**, as its own Compose project, and sends mail the same way live does, but only to test
contacts.

## How a deploy reaches vultr1

```
Stage Director button ─▶ workflow: gate job (GitHub-hosted, checks code-owner approval for live)
   ─▶ run job queued for label meru-staging / meru-live
vultr1, timer every 20 s ─▶ "job queued for my label?" ─▶ ephemeral runner container (one job)
   ─▶ deploy/stagedirector.sh ─▶ /run/stagedirector/meru-<stage>.sock (deploy broker)
   ─▶ stagedirector-remote meru <stage>    (fixed by the socket, not the caller)
        guard ─▶ git checkout <sha> ─▶ docker compose -p <project> up -d --build ─▶ health ─▶ auto-rollback
```

Nothing reaches into vultr1: no deploy port and no deploy SSH keys, so Tailscale SSH stays on
for people. No runner exists while nothing is queued, and a job's runner can only ask the broker
for `deploy <sha>`, `rollback <id>` or `status` of its one stage. Setup: `kits/runner-broker/README.md`.

The GitHub-hosted path below (Tailscale + forced-command SSH) still works with `runner: github`.

> **Tailscale SSH caveat:** if Tailscale SSH (`tailscale up --ssh`) is on for vultr1, it answers
> tailnet connections itself and **ignores `authorized_keys`, including the forced command**. A
> GitHub job that joined the tailnet would then not be locked to `stagedirector-remote`. Turn
> Tailscale SSH off for vultr1 (or have the job reach `sshd` on a non-Tailscale path) before
> installing the stage keys, and test that a stage key cannot get a shell.

## Staging, isolated from live

| | Live | Staging |
|---|---|---|
| Compose project | `meru-pipeline` (+ `meru-mautic…`) | `meru-stg-pipeline` (+ `stg-meru-mautic`) |
| Containers, named volumes | live's | prefixed `meru-stg-pipeline_` |
| Network | `meru-mautic-local_default` | `stg-meru-mautic_default` |
| Ports (127.0.0.1) | 58088, 58095 | 58188, 58195 |
| sendgw registry | `/opt/meru-pipeline/sendgw` | `/opt/stg-meru/sendgw` (own `domains.json`, small `daily_cap`) |
| Cloudflare KV namespace, token | live's | own namespace, staging-only token |
| Mailgun webhook | live's | own webhook + signing key |
| Files on the host | `/opt/meru-*` | `/opt/stg-meru` |
| Caps | none set | 384 MB / 0.5 CPU per service |
| Backups | yes | no: live's `backup.sh` takes fixed names (`meru-mautic-local-*`, `meru-pipeline_*` volumes, `/opt/meru-*`); staging's names match none of them. Keep them that way. |

`stagedirector-remote` refuses any project listed in `PROTECTED_PROJECTS` (live's), never runs
`down`, and always passes `-p`. **Never run `docker compose down -v` without `-p meru-stg-pipeline`.**

## Mail on staging (owner: "test contacts only")

- **Same path as live:** sendgw → Mailgun/Gmail, so a staging test is a real test.
- **Who may receive:** only the company's internal test addresses, the same list live already
  uses: `GATEWAY_CAP_EXEMPT_RECIPIENTS` in `/opt/meru-pipeline/.env` (at most 10). Staging's
  `GATEWAY_RECIPIENT_ALLOWLIST` is a copy of it, made at setup (not hard-coded). sendgw parks
  and logs mail to anyone else, and also parks test-labelled subjects sent outside the list.
- **Only test contacts in staging Mautic:** after any copy from live, `scrub-mautic-contacts.sql`
  removes the email and phone of every contact not on the list (contacts tagged `tgt-` stay only if
  their address is on it).
- **Small daily cap:** `STAGING_DAILY_CAP` (default 20) for the internal lane, and staging's own
  `domains.json` caps (guard refuses above 25).
- **Tagged:** `X-Stage: staging` header and `[STAGING] ` subject prefix. **Not in sendgw yet**:
  Meru work item `GATEWAY_STAGE_TAG`, needed before staging's first send.
- **Mautic cron off by default** on staging (give it a Compose `profiles: [cron]`).
- `meru-staging-mail-guard` runs on the host before every staging deploy. It refuses when the
  allowlist is empty or holds any address not on live's internal list, when staging shares live's
  registry or has high caps, when staging Mautic cron runs, or when staging Mautic has any contact
  outside the allowlist (it prints only the count, never addresses, and points at the scrub SQL).

## Files

| File | Goes to |
|---|---|
| `stagedirector.yml` | Meru repo root |
| `stagedirector.sh` | Meru `deploy/stagedirector.sh` |
| `docker-compose.staging.yml` | Meru `deploy/vultr1/docker-compose.staging.yml` |
| `staging.env.example` | vultr1 `/opt/stg-meru/.env` (filled, never committed) |
| `meru-staging-mail-guard` | vultr1 `/usr/local/bin/` |
| `scrub-mautic-contacts.sql` | run on staging Mautic after any copy from live |
| `../../kits/ssh-compose/stagedirector-remote` | vultr1 `/usr/local/bin/` |
| `../../kits/ssh-compose/example.env` | vultr1 `/etc/stagedirector/meru-staging.env` |

## Owner steps (by hand)

1. **vultr1:** make `/opt/stg-meru/{repo,sendgw}` (not under `/opt/meru-*`, so live's backup skips it), clone Meru into `repo` with a read-only
   GitHub deploy key, copy live's `domains.json` into `sendgw/` and lower every `daily_cap`, fill
   `/opt/stg-meru/.env` (copy `GATEWAY_CAP_EXEMPT_RECIPIENTS` from `/opt/meru-pipeline/.env` into
   `GATEWAY_RECIPIENT_ALLOWLIST`), install `stagedirector-remote` and the guard, write
   `/etc/stagedirector/meru-staging.env`.
2. **Staging Mautic:** a separate `stg-meru-mautic` project (not `meru-mautic-local`) with its own
   database, cron off, test contacts only; run `scrub-mautic-contacts.sql` after any copy from live.
3. **Keys:** one ed25519 key per stage. On vultr1, for the deploy user's `authorized_keys`:
   `command="/usr/local/bin/stagedirector-remote meru staging",restrict ssh-ed25519 …`
   (and a separate `… meru live` line later). Private keys go to GitHub only.
4. **GitHub (Meru repo):** environments `stagedirector-staging` / `stagedirector-live`, deployment
   branch `main`. Secrets per environment: `STAGEDIRECTOR_SSH_KEY`, `TS_OAUTH_CLIENT_ID`,
   `TS_OAUTH_SECRET`, `CLOUDFLARE_API_TOKEN` (staging token on staging only); variable
   `STAGEDIRECTOR_KNOWN_HOSTS` (vultr1's host key line).
5. **Cloudflare:** staging KV namespace, staging Worker/Pages names, staging-only API token;
   staging Mailgun webhook pointing at staging's endpoint.

## Sign-in page in front of staging (Cloudflare Access)

Owner: "Maybe we put a sign-in page in front of it." Setup steps, by hand, in Cloudflare Zero Trust:

1. **DNS:** `staging.webdevsteam.com` → staging's entry point (Cloudflare Tunnel to vultr1's staging
   Caddy, or a proxied record). Proxy on, so Access applies.
2. **Zero Trust → Access → Applications → Add → Self-hosted:** domain `staging.webdevsteam.com`,
   session 24 h.
3. **Policy "Team":** Allow; Include → emails ending in the company domain (or named people);
   login with One-time PIN or Google.
4. **Bypass only what must stay public**, as separate applications with a Bypass policy: staging's
   Mailgun webhook path, and the unsubscribe/booking paths if you want to test them from a phone
   without signing in.
5. **Smoke tests:** the workflow sends Basic auth today, not Access headers. Simplest: a bypassed
   `/healthz` for `smokeTest`. Later: an Access Service Token in the `stagedirector-staging`
   environment plus a small workflow change to send `CF-Access-Client-Id`/`Secret`.
6. Check in a private window: the sign-in page shows; after sign-in staging loads; the webhook path
   answers without it.

## Still open

- Meru code: `GATEWAY_STAGE_TAG` in sendgw (X-Stage header + `[STAGING] ` subject prefix), and a
  cron profile for staging Mautic.
- Smoke tests through Access: bypassed `/healthz` now, or service-token headers later.
