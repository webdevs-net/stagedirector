#!/usr/bin/env bash
# Run the dashboard locally against real GitHub data.
# The token is read from your GitHub CLI login at start-up and handed to the
# app in memory only. It is never written to a file or printed.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v gh >/dev/null || { echo "Install the GitHub CLI and run: gh auth login"; exit 1; }
token="$(gh auth token 2>/dev/null)" || { echo "Not signed in. Run: gh auth login"; exit 1; }
GITHUB_TOKEN="$token" exec npx next dev -p "${PORT:-53100}"
