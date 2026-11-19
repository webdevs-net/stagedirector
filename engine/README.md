# Engine

What actually moves code. The dashboard only starts runs of this workflow and reads
GitHub records.

| File | What |
|---|---|
| `workflow/stagedirector.yml` | GitHub Actions workflow each project copies to `.github/workflows/stagedirector.yml` |
| `contract.md` | what each project's deploy command must do; the live gate; records the dashboard reads |
| `runner/setup-ovh1.sh`, `runner/README.md` | self-hosted runner on ovh1 (**not run**; for the owner) |
| `compose/` | portable Docker Compose bundle: runner + ssh/rsync/gh/Wrangler/docker CLI (**not run**) |
| `kits/ssh-compose/` | forced-command SSH deploy for Docker Compose hosts (`stagedirector-remote`), used with `runner: github` + Tailscale (**not installed**) |
| `examples/meru/` | **Meru (priority)**: staging next to live on vultr1, test-contacts-only mail, guard, contact scrub, files to copy |
| `patches/mariasplace-deploy.patch`, `.md` | Maria's Place `scripts/deploy.sh` changes (**not applied**) |

Lint: `actionlint engine/workflow/stagedirector.yml` (runs shellcheck on the `run:` blocks),
`shellcheck engine/runner/setup-ovh1.sh`.
