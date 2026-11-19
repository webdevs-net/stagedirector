#!/usr/bin/env bash
# Registers the runner once (state kept in the /home/runner/state volume), then runs it.
# Re-running `docker compose up -d` is safe: an already-registered runner just starts.
set -euo pipefail
die() { printf 'stagedirector-runner: %s\n' "$*" >&2; exit 1; }

LABELS="${RUNNER_LABELS:-self-hosted}"
STATE=/home/runner/state
cd /home/runner

# Ephemeral mode: the host loop (stagedirector-runner-loop) passes a single-use JIT config.
# No registration state, no token: the runner takes one job and exits, and the container is removed.
if [ -n "${RUNNER_JITCONFIG:-}" ]; then
  jit="$RUNNER_JITCONFIG"; unset RUNNER_JITCONFIG
  exec ./run.sh --jitconfig "$jit"
fi

# The runner keeps its registration in .runner, .credentials and .credentials_rsaparams.
for f in .runner .credentials .credentials_rsaparams; do
  [ -f "$STATE/$f" ] && cp -p "$STATE/$f" "./$f"
done

if [ ! -f .runner ]; then
  : "${GITHUB_URL:?set GITHUB_URL in .env (https://github.com/<owner>/<repo> or https://github.com/<org>)}"
  : "${RUNNER_NAME:?set RUNNER_NAME in .env}"
  [ -n "${RUNNER_TOKEN:-}" ] || die "not registered yet: put a fresh registration token in RUNNER_TOKEN (.env) and run again"
  ./config.sh --unattended --url "$GITHUB_URL" --token "$RUNNER_TOKEN" \
    --name "$RUNNER_NAME" --labels "$LABELS" --work /home/runner/_work --replace
  for f in .runner .credentials .credentials_rsaparams; do cp -p "./$f" "$STATE/$f"; done
  echo "stagedirector-runner: registered $RUNNER_NAME ($LABELS). You can now delete RUNNER_TOKEN from .env."
fi

# Optional SSH alias config and known_hosts for project hosts (no private keys: those come
# from GitHub Environment secrets through ssh-agent inside each job).
if [ -d /home/runner/ssh-config ]; then
  install -d -m 700 /home/runner/.ssh
  for f in config known_hosts; do
    [ -f "/home/runner/ssh-config/$f" ] && install -m 600 "/home/runner/ssh-config/$f" "/home/runner/.ssh/$f"
  done
fi

exec ./run.sh
