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

## Keep Tailscale SSH for people, give deploy jobs their own locked port

Tailscale SSH (`tailscale up --ssh`) answers port 22 on vultr1's tailnet address itself and
**never reads `authorized_keys`**, so the forced command would not apply there. Keep it for
people, and send deploy jobs to the server's own `sshd` on **port 2222**, which only the tailnet
can reach and where every key is locked to `stagedirector-remote`.

**1. Tailscale access rules** (admin console > Access controls). Tag vultr1 (e.g. `tag:vultr1`)
and the deploy job joins as `tag:ci` (set in the workflow). `tag:ci` may reach only port 2222,
and no `ssh` rule may name it, so it can never get a Tailscale SSH shell:

```jsonc
"grants": [
  // deploy jobs: the locked port only
  {"src": ["tag:ci"], "dst": ["tag:vultr1"], "ip": ["tcp:2222"]}
],
"ssh": [
  // people only; never list tag:ci or autogroup:tagged here
  {"action": "check", "src": ["autogroup:member"], "dst": ["tag:vultr1"], "users": ["autogroup:nonroot", "root"]}
]
```

**2. `sshd` on 2222 for the deploy user only.** `/etc/ssh/sshd_config.d/stagedirector.conf`:

```
# Port 22 stays (public sshd as today); 2222 is added for Stage Director.
Port 22
Port 2222
Match LocalPort 2222
    AllowUsers stagedirector
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PermitTTY no
    AllowTcpForwarding no
    AllowAgentForwarding no
    AllowStreamLocalForwarding no
    X11Forwarding no
    PermitTunnel no
```

Before restarting: `sudo sshd -T | grep -i '^port'` (both ports, no duplicates) and
`sudo sshd -t`. On Ubuntu 22.10+ sshd is socket-activated: `sudo systemctl daemon-reload &&
sudo systemctl restart ssh.socket`. Keep your current SSH session open while you test.

**3. Firewall: 2222 from the tailnet only.** `sudo ufw allow in on tailscale0 to any port 2222
proto tcp` and no public rule for 2222 (also block it in the Vultr firewall, if one is used).

**4. Locked keys.** User `stagedirector` (no sudo, not in the `docker` group; `stagedirector-remote`
does the privileged steps). One key per stage in `~stagedirector/.ssh/authorized_keys`:

```
command="/usr/local/bin/stagedirector-remote meru staging",restrict ssh-ed25519 AAAA... stagedirector-meru-staging
command="/usr/local/bin/stagedirector-remote meru live",restrict ssh-ed25519 AAAA... stagedirector-meru-live
```

`restrict` turns off shells, ttys, forwarding and file transfer; the key can only start that
script, and the script only accepts `deploy <sha>`, `rollback <id>` or `status`.

**5. GitHub side.** Per environment: `STAGEDIRECTOR_SSH_KEY` = that stage's private key.
Repo variable `STAGEDIRECTOR_KNOWN_HOSTS` with the port in brackets:
`[vultr1.<tailnet>.ts.net]:2222 ssh-ed25519 AAAA...` (from `ssh-keyscan -p 2222 <host>`).
`deploy/stagedirector.sh` connects to `STAGEDIRECTOR_HOST` on `STAGEDIRECTOR_PORT` (default 2222).

**6. Prove the lock before the first deploy** (from a tailnet device, with the staging key):

```bash
ssh -p 2222 -i staging_key stagedirector@vultr1 id         # must print the script's refusal, not uid=
ssh -p 2222 -i staging_key -t stagedirector@vultr1          # no shell
ssh -p 2222 -i staging_key -N -L 9999:127.0.0.1:58088 stagedirector@vultr1   # forwarding refused
ssh -p 2222 -i staging_key stagedirector@vultr1 status     # works
```

And from a `tag:ci` node, `ssh vultr1` on port 22 must be refused by Tailscale.

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
