#!/usr/bin/env bash
# Run the dashboard locally against real GitHub data.
#
# Preferred: the dashboard's own GitHub App (its own hourly limit, separate from yours).
# .env.local sets GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID and STAGEDIRECTOR_APP_KEY_1PASSWORD
# (the 1Password item id of the app's private key). The key is read from 1Password at start-up
# and handed to the app in memory only; it is never written to a file or printed.
#
# Fallback: your GitHub CLI login (shares your personal hourly limit with gh and other tools).
set -euo pipefail
cd "$(dirname "$0")/.."

envval() { [ -f .env.local ] && sed -n "s/^$1=//p" .env.local | tail -1; }
APP_ID="$(envval GITHUB_APP_ID || true)"
KEY_ITEM="$(envval STAGEDIRECTOR_APP_KEY_1PASSWORD || true)"
KEY_VAULT="$(envval STAGEDIRECTOR_APP_KEY_VAULT || true)"

if [ -n "$APP_ID" ] && [ -n "$KEY_ITEM" ]; then
  command -v op >/dev/null || { echo "Install the 1Password CLI (op) to read the app key."; exit 1; }
  echo "Reading the Stage Director app key from 1Password (approve the prompt)..."
  key="$(op document get "$KEY_ITEM" ${KEY_VAULT:+--vault "$KEY_VAULT"})" || { echo "Could not read the app key from 1Password."; exit 1; }
  GITHUB_APP_PRIVATE_KEY="$key" GITHUB_TOKEN="" exec npx next dev -p "${PORT:-53100}"
fi

command -v gh >/dev/null || { echo "Install the GitHub CLI and run: gh auth login"; exit 1; }
token="$(gh auth token 2>/dev/null)" || { echo "Not signed in. Run: gh auth login"; exit 1; }
echo "No GitHub App set in .env.local: using your personal GitHub login (shared hourly limit)."
GITHUB_TOKEN="$token" exec npx next dev -p "${PORT:-53100}"
