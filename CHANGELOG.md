# Changelog

Stage Director follows [Semantic Versioning](https://semver.org/). While the version is 0.x,
a minor bump (0.6.0) can include breaking changes; a patch bump (0.5.1) is fixes only.
Add notes under **Unreleased** in every PR; they move under a version number on release.

## Unreleased

- Local GitHub Actions by default: "Check rules" runs on a self-hosted `sd-gate` runner unless a project sets `gateRunner: github` (or the repo variable `STAGEDIRECTOR_GATE_RUNNER=github`). The dashboard always sends `gate_runner`.
- Inquire tab on each project: ask every stage how it is (reachable? status? runner? local path), and list every checkout mapped in `stagedirector.local.json` when you are on localhost.
- A failed run now says so. History shows "Beta update failed" (not "Beta updated"), with GitHub's reason (for example "Actions billing is blocked"); the project page shows a red banner while a stage's newest update failed and nothing has succeeded since. Found pressing Build on Loquio while its GitHub billing was blocked.
- App projects: the review page says "Before you release it to users" and "To-do after releasing", and shows the list of changes instead of website screenshots.
- Apps on the dashboard (first: Loquio desktop). In `stagedirector.yml`: `type: app` changes the words ("Release to users", "Download the beta", "Released") and hides the website-only tools (out of sync, Save a backup, Copy live to staging, site watch); `host: none` skips the SSH key and Tailscale steps, so a stage that publishes a GitHub Release needs no host secrets; `timeoutMinutes` (up to 360) lets a deploy that builds an app run longer than 45 minutes. The version tag (`v1.4.0`) shows next to the short commit on stage cards and the home list. An app project sets `actions: write` in its copy of the workflow (one marked line) so its deploy command can start and follow its own release workflow; websites keep `actions: read`. An app's beta is built from a chosen release tag (a list of the newest `v*` tags on the branch), so the deployment, the approval and the release all use the tag's commit even when other pull requests merged after tagging.
- Review page: real before/after screenshots. Deploys photograph the stage's pages and live's (desktop and phone) as a run artifact; the dashboard shows them side by side. Runner image includes Chromium (`WITH_BROWSER=false` to leave out).
- Logo: director's chair with a star (docs/brand/stage-director-logo.svg) and star-tile icon; brand section in CLAUDE.md; favicon, home header and README now use it
- The repo moved to `webdevs-net/stagedirector`; links updated.

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
