# 🛠️ Stage Director: the technology

What runs behind the buttons. For how to set it up, see [SETUP.md](SETUP.md).

**At a glance**

- **Dashboard:** Next.js 15 + React 19 + Tailwind 4, TypeScript, in Docker on your own server, reached over Tailscale.
- **Sign-in:** Auth.js (NextAuth v5) with GitHub. Live actions use the person's own GitHub token.
- **GitHub is the database:** Deployments, commit statuses, refs and workflow runs hold every record.
- **The engine:** one GitHub Actions workflow per project, on a self-hosted runner, calling the project's own deploy script.
- **The live lock:** code-owner approval of the exact commit, plus host keys kept in GitHub Environments that only `main` can use.
- **Light on GitHub's API:** stale-while-revalidate cache on disk, ETags, one gateway with a budget, one connection pool that counts every call.
- **Git without the API:** a local bare copy of each repo, kept current with `git fetch`.
- **Summaries:** Claude (Anthropic API) writes the plain-English "what this update does".
- **Tests:** Vitest (unit, a fake GitHub, real sockets) and Playwright (screens).

---

## How a button press becomes a deploy

```
Dashboard button ──► workflow_dispatch (person's token for live)
                       │
                       ▼
   "Check rules" job (GitHub-hosted): branch, inputs, who, pins,
   approval record, strict order  ──refused──► run summary says why
                       │ ok
                       ▼
   "Run" job (self-hosted runner, Environment stagedirector-<stage>)
   ssh-agent gets the host key ─► project's deploy command
                       │
   exit 0 ─► smoke test ─► clear cache ─► Deployment "success"
   exit 2 ─► refused, nothing touched ─► "failure"
   other  ─► Safety net: rollback {backup} ─► "failure" or "error"
```

The dashboard never talks to a website host. It starts runs and reads records.
The contract a project's deploy script must meet is in [engine/contract.md](../engine/contract.md).

## Parts

| Part | Built with | Where |
|---|---|---|
| Web app | Next.js App Router, React Server Components, Tailwind CSS 4 | `src/app`, `src/components` |
| Sign-in and permissions | Auth.js v5 (GitHub provider), GitHub collaborator permission, `CODEOWNERS` | `src/lib/auth` |
| GitHub access | Octokit REST, GitHub App (`@octokit/auth-app`) or a token | `src/lib/github/client.ts` |
| Config | `stagedirector.yml` per project, parsed with `yaml`, checked with `zod` | `src/lib/config` |
| Engine | GitHub Actions workflow, Bash, `jq`, `ssh`, `rsync` | `engine/workflow`, `engine/runner` |
| Runner | GitHub Actions runner as a locked-down systemd service, or Docker Compose | `engine/runner`, `engine/compose` |
| Version check | Scheduled workflow reading `/.stagedirector-version` on each site | `engine/workflow/stagedirector-observe.yml` |
| Update summaries | Anthropic SDK (Claude), cached per PR head | `src/lib/github/summary.ts` |
| Deploy | Docker, `tailscale serve` | `Dockerfile`, `deploy/` |

## Records (GitHub is the database)

| Record | Means |
|---|---|
| Deployment, environment `<stage>` | One per push. Newest with status `success` = what is on the stage |
| Deployment, environment `observed-<stage>` | What a version check saw on the server (display only) |
| Commit status `stagedirector/approval/<stage>` | A code owner approved this exact commit |
| Ref `refs/stagedirector/pins/<stage>` | The stage is pinned |
| Workflow runs named "Stage Director" | Busy state, logs, history |

Nothing else is stored, so a fresh dashboard shows the same truth as the old one.

## Staying inside GitHub's rate limit

Every REST call goes through two layers in `src/lib/github`:

1. **Gateway** (`gateway.ts`): tags each call by where it came from (page, timed refresh, button press), shares identical requests already in flight, sends `If-None-Match` so unchanged answers come back as free 304s, and caps background calls (default 5 a minute). Button presses are never held back. When GitHub says the hour's budget is low, background refreshes pause.
2. **Connection pool** (`pool.ts`): one `undici` keep-alive agent under every GitHub client: the App, its token sign-ins, and calls made with a person's own token. It records each request as it is sent, with GitHub's own `x-ratelimit-*` numbers, and counts connections opened vs reused. `git fetch` runs from the local copies are listed too, apart from the API. The last hour is kept in a small temporary Float32 file, so a restart keeps the counts.

Pages are drawn from a stale-while-revalidate cache (`swr.ts`) saved to `.stagedirector-cache/`, so a restart or a rate-limited hour still shows the last known state at once. Only a visible tab polls (default every 60 s). `/usage` shows all of it.

## Git without the API

`localgit.ts` keeps a bare clone of each project and answers branch heads, "how far behind" and change lists with plain `git`. Button presses still check against GitHub itself.

## Security model

- Live needs: dispatch from the default branch, a code owner pressing the button with their own token, a code-owner approval record for that exact commit, not pinned, staging already on that commit.
- Host keys live only in GitHub Environment secrets limited to `main`. A separate key per stage keeps the live key out of staging jobs.
- AI assistants can ask for a staging update; a person always presses OK. Requests and approvals that start with `claude:` are refused for live.
- The runner user has no `sudo` or `docker` and runs under systemd limits.
