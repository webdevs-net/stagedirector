# Changelog

Stage Director follows [Semantic Versioning](https://semver.org/). While the version is 0.x,
a minor bump (0.6.0) can include breaking changes; a patch bump (0.5.1) is fixes only.
Add notes under **Unreleased** in every PR; they move under a version number on release.

## Unreleased

- Review page: real before/after screenshots. Deploys photograph the stage's pages and live's (desktop and phone) as a run artifact; the dashboard shows them side by side. Runner image includes Chromium (`WITH_BROWSER=false` to leave out).
- Logo: director's chair with a star (docs/brand/stage-director-logo.svg) and star-tile icon; brand section in CLAUDE.md; favicon, home header and README now use it
- The repo moved to `webdevs-net/stagedirector`; links updated.
- Workflow: an automatic (push) deploy that waited for a runner now checks, once it starts, that its commit is still the head of the branch. If newer commits landed meanwhile it stops without failing, so an old commit can no longer overwrite staging. Deploys started from the dashboard are unchanged.
- Dashboard: a run stuck in the queue says how long it has waited ("Waiting for a runner 12 min"), and the project page says when no runner at all has a stage's label.

## 0.5.0 (2026-11-19)

First versioned release. Everything below shipped before versioning started.

### Dashboard
- Home screen for many projects: grouped by client, search, filters, stars, a "Waiting on you" banner, coloured stage bars (#1, #26)
- Project page: everyday work, a plain-English summary for each waiting change, banners, status colours that match the real state (#5, #21, #26)
- Run window and dimmed project that follow the real GitHub Actions run (#3)
- Pin a version to freeze a stage (#6)
- Claude asks, a person approves (#9)
- Activity record across projects, with CSV download (#10)
- Live refresh, local mode, detection of deploys made outside Stage Director (#20)
- Fast pages: cached GitHub reads, a rate-limit gateway, `/usage` (#22, #23)
- `npm run dev:live` reads the GitHub App key from 1Password (#25)
- Sales-style README with fresh screenshots; setup moved to `docs/SETUP.md` (#1, #28)

### Engine and runner
- Portable Docker Compose runner bundle, kept current, with troubleshooting (#2, #17)
- Dashboard container for ovh1, reachable over Tailscale only (#4)
- Checks before and after: pages load, login works, no PHP errors (#7)
- No-downtime switch: release folders, atomic swap, instant undo (#8)
- Save a backup from the Toolbox (#14, #16)
- Meru: locked deploy keys on port 2222; Tailscale SSH stays for people (#18)
- Quiet pull-only runners: on-demand ephemeral runner and per-stage deploy broker (#19)
- Optional "Check rules" on a self-hosted runner (#24)
- Runner health and self-healing (#27)

### Fixes
- Safety net keeps working under GitHub's `bash -e` (#11)
- Smoke test fails on a 401 instead of passing unchecked (#12)
- Handled 404s no longer logged as errors (#13)
- Fuller tests (fake GitHub, browser tests, CI) and the bugs they found (#15)
