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

## Look
Cool palette from the mockups: background #f2f6fa, text #1e2b3a, muted #5a6b7d, teal #0f8f8a / #dff5f3, blue #2563b8 / #e8f1fd, amber only for warnings. Nunito. Big rounded buttons (≥52px), details folded until opened.
