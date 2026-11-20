# Stage Director

A friendly, multi-project deploy dashboard: code moves local → staging → live,
and only code owners can put anything live. Next.js (App Router, TypeScript,
Tailwind) on top of self-hosted GitHub Actions runners.

- Plan: https://claude.ai/artifact/LKsrQzYKAcVXz4BhgWHJcv
- Mockups: https://claude.ai/artifact/UvM8iRL9AvZdk9ro2VizbM
- Shared types: `src/lib/types.ts`. Project config: `stagedirector.yml` (see `examples/`).

## Hosting and access
- Runs on ovh1 at `stagedirector.webdevs.net` (exact name to confirm), reachable **only over Tailscale**. No public port, no public DNS record pointing at it.
- Two locks: Tailscale (only tailnet devices reach it) + GitHub sign-in (who you are, and your role from CODEOWNERS).
- Nothing may depend on inbound calls from the internet: no GitHub webhooks into the dashboard. Read state by polling the GitHub API; the runner only makes outbound connections.
- GitHub sign-in: OAuth app "Stage Director" owned by `netdevs-net` (https://github.com/settings/applications/4034040), client ID `Ov23liJNAQW9rZSh7Nyb`. Callbacks: `https://stagedirector.webdevs.net/api/auth/callback/github` and `http://localhost:3100/api/auth/callback/github`. The client secret is generated and stored by the owner only (never in git or chat).
- HTTPS via Tailscale (`tailscale serve` / a cert for the tailnet name) or a DNS-challenge cert for the webdevs.net name.

## Rules
- The dashboard never talks to hosting directly. Buttons start GitHub workflow runs; status, logs and history come from the GitHub API.
- Approval for the last stage is a person's action by a code owner (from the project's CODEOWNERS). No script, test fixture or AI session may approve or push live by itself.
- Never change a real server (ovh1, Hostinger) or a live site from this repo's work without the owner's explicit OK. Write setup scripts and docs; do not run them against servers.
- Package manager: npm (no pnpm on this Mac).

## Folder ownership (parallel sessions)
- `src/app/**`, `src/components/**`, `src/lib/mock.ts` — UI
- `src/lib/github/**`, `src/lib/config/**`, `src/lib/auth/**`, `src/app/api/**` — data layer and auth
- `engine/**` (workflow templates, runner setup, deploy contract docs) — engine
- `src/lib/types.ts` — shared; change only by agreement, note it in docs/PLAN.md

## Versions and branches

- Version lives in `package.json` and follows SemVer; history is in `CHANGELOG.md`.
- Every PR adds a line under **Unreleased** in `CHANGELOG.md`.
- Release: bump with `npm version <x.y.z> --no-git-tag-version`, move the Unreleased notes under the new number, merge to `main`, then tag `v<x.y.z>` on the merge commit and publish a GitHub release from the changelog section.
- Branches: `dev` for everyday work, `main` by pull request only (checks must pass), `live` by pull request only. Nobody pushes to `live` directly. Never force-push or delete these branches.

## Look
Cool palette from the mockups: background #f2f6fa, text #1e2b3a, muted #5a6b7d, teal #0f8f8a / #dff5f3, blue #2563b8 / #e8f1fd, amber only for warnings. Nunito. Big rounded buttons (≥52px), details folded until opened.

## Brand & design system
- Approved by the owner (2026-11-20): concept B as the logo, concept D as the favicon/app icon.
- Logo: `docs/brand/stage-director-logo.svg` (director's chair, star cut into the back). Icon/favicon: `docs/brand/stage-director-icon.svg` (star in a rounded tile).
- Both are one-colour black masters; use them exactly as they are (no redrawing, cropping or rearranging). Colour comes from the palette under **Look** (teal #0f8f8a or text #1e2b3a; white when reversed).
- Brief and rejected concepts: `docs/brand/BRIEF.md`, `docs/brand/concepts/`.
- In use: `src/app/icon.svg` (teal favicon), `public/brand/stage-director-logo-{white,teal}.svg` (home header, README). Not yet: lockups.
