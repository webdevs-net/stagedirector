#!/usr/bin/env bash
# Stage Director runner watchdog. Run every ~2 minutes (systemd timer or cron, see README).
# Restarts the runner container when Docker says it is unhealthy / not running, or when
# GitHub says the runner is offline. Backs off after repeated restarts so a broken runner
# is not restarted in a tight loop. One log line per run that does something.
#
# Settings (environment, e.g. from /etc/stagedirector/watchdog.env):
#   SD_CONTAINER     container name                     (default: stagedirector-runner-runner-1)
#   SD_REPO          owner/name the runner serves       (optional; needed for the GitHub check)
#   SD_RUNNER_NAME   runner name as GitHub lists it     (optional; needed for the GitHub check)
#   SD_GH_TOKEN      token that may read the repo's runners (Administration: read). Optional;
#                    without it only the Docker health is checked.
#   SD_STATE_DIR     where the backoff state lives      (default: /var/lib/stagedirector-watchdog)
#   SD_MAX_BACKOFF   longest wait between restarts, s   (default: 1800)
#   SD_DRY_RUN=1     log what would happen, change nothing
set -uo pipefail

CONTAINER="${SD_CONTAINER:-stagedirector-runner-runner-1}"
STATE_DIR="${SD_STATE_DIR:-/var/lib/stagedirector-watchdog}"
MAX_BACKOFF="${SD_MAX_BACKOFF:-1800}"
STATE="$STATE_DIR/$CONTAINER.state"
now=$(date +%s)

log() { echo "$(date -u +%FT%TZ) stagedirector-watchdog[$CONTAINER]: $*"; command -v logger >/dev/null && logger -t stagedirector-watchdog "[$CONTAINER] $*"; return 0; }

mkdir -p "$STATE_DIR"
fails=0; next_ok=0
# shellcheck disable=SC1090
[ -f "$STATE" ] && . "$STATE"

save() { printf 'fails=%s\nnext_ok=%s\n' "$1" "$2" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"; }

# 1. Docker's view.
docker_state=$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER" 2>/dev/null || echo "missing missing")
status=${docker_state% *}; health=${docker_state#* }
problem=""
if [ "$status" = "missing" ]; then
  log "container not found; start it with docker compose up -d (not done automatically)"; exit 0
fi
[ "$status" != "running" ] && problem="container is $status"
[ -z "$problem" ] && [ "$health" = "unhealthy" ] && problem="container is unhealthy"

# 2. GitHub's view (only when configured). A failed API call is not a reason to restart.
if [ -z "$problem" ] && [ -n "${SD_GH_TOKEN:-}" ] && [ -n "${SD_REPO:-}" ] && [ -n "${SD_RUNNER_NAME:-}" ]; then
  gh_status=$(curl -fsS --max-time 20 -H "Authorization: Bearer $SD_GH_TOKEN" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$SD_REPO/actions/runners?per_page=100" 2>/dev/null \
    | python3 -c 'import json,sys; n=sys.argv[1]; r=[x for x in json.load(sys.stdin)["runners"] if x["name"]==n]; print(r[0]["status"] if r else "absent")' "$SD_RUNNER_NAME" 2>/dev/null || echo "unknown")
  # Give a fresh start time to register before judging it.
  if [ "$gh_status" = "offline" ] || [ "$gh_status" = "absent" ]; then
    started=$(date -d "$(docker inspect -f '{{.State.StartedAt}}' "$CONTAINER")" +%s 2>/dev/null || echo 0)
    [ $((now - started)) -gt 180 ] && problem="GitHub lists runner $SD_RUNNER_NAME as $gh_status"
  fi
fi

if [ -z "$problem" ]; then
  [ "$fails" != 0 ] && log "healthy again after $fails restart(s)"
  save 0 0
  exit 0
fi

if [ "$now" -lt "$next_ok" ]; then
  log "$problem; backing off, next restart allowed in $((next_ok - now))s"
  exit 0
fi

fails=$((fails + 1))
wait=$((120 * (1 << (fails > 5 ? 5 : fails - 1))))
[ "$wait" -gt "$MAX_BACKOFF" ] && wait=$MAX_BACKOFF
if [ "${SD_DRY_RUN:-0}" = "1" ]; then
  log "$problem; would restart (attempt $fails, then wait ${wait}s) [dry run]"
  exit 0
fi
log "$problem; restarting (attempt $fails, next allowed after ${wait}s)"
docker restart "$CONTAINER" >/dev/null 2>&1 || log "docker restart failed"
save "$fails" $((now + wait))
