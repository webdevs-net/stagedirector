#!/usr/bin/env bash
# Meru's deploy command for Stage Director (copy into Meru as deploy/stagedirector.sh).
# Runs in the GitHub-hosted job after it joined the tailnet; the SSH key in the agent is a
# forced-command key for exactly one stage, so this script only says what to do.
#
#   deploy/stagedirector.sh <staging|live>                 deploy STAGEDIRECTOR_COMMIT
#   deploy/stagedirector.sh rollback <staging|live> <id>
#   deploy/stagedirector.sh status --json                  (per stage, needs that stage's key)
set -euo pipefail
HOST="${STAGEDIRECTOR_HOST:-vultr1-deploy}"   # alias or tailnet name; host key pinned by the workflow
PORT="${STAGEDIRECTOR_PORT:-2222}"             # sshd port for locked keys (Tailscale SSH keeps 22)
SOCK="${STAGEDIRECTOR_BROKER_SOCKET:-}"           # set inside the self-hosted runner container
remote() {
  if [ -n "$SOCK" ]; then
    # Self-hosted on vultr1: one line to this stage's deploy broker; last line carries the exit code.
    local out rc
    out="$(printf '%s\n' "$*" | socat -t 2400 - "UNIX-CONNECT:$SOCK")" || { echo "deploy broker unreachable at $SOCK" >&2; return 1; }
    rc="$(sed -n 's/^STAGEDIRECTOR_EXIT=\([0-9]*\)$/\1/p' <<<"$out" | tail -1)"
    grep -v '^STAGEDIRECTOR_EXIT=' <<<"$out" || true
    return "${rc:-1}"
  fi
  ssh -o BatchMode=yes -o ConnectTimeout=15 -p "$PORT" "$HOST" "$*"
}
case "${1:-}" in
  staging|live)
    [ "${STAGEDIRECTOR_STAGE:-}" = "$1" ] || { echo "stage mismatch" >&2; exit 2; }
    remote "deploy ${STAGEDIRECTOR_COMMIT:?} ${STAGEDIRECTOR_REQUESTED_BY:-stagedirector}" ;;
  rollback) remote "rollback ${3:?backup id}" ;;
  status)   remote status ;;
  *) echo "usage: stagedirector.sh <staging|live> | rollback <stage> <id> | status --json" >&2; exit 2 ;;
esac
