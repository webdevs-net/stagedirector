#!/usr/bin/env bash
#
# Stage Director: set up a self-hosted GitHub Actions runner on ovh1.
#
#   *** NOT RUN BY ANYONE YET. Written for the owner to read and run by hand, as root, on ovh1. ***
#
#   sudo bash setup-ovh1.sh runner  <owner/repo> <registration-token>   install + register one runner
#   sudo bash setup-ovh1.sh hostkey <project> <ssh-host-alias> <user@host> [port]
#                                                                        make a deploy key for one project host
#   sudo bash setup-ovh1.sh status                                       show service + limits
#
# What it does (and nothing else):
#   * creates the system user `stagedirector-runner` (no sudo, no password, home /srv/stagedirector)
#   * installs git, jq, python3-yaml, rsync, curl, gh (if missing) with apt
#   * downloads the GitHub Actions runner (version pinned below, sha256-checked) into
#     /srv/stagedirector/runners/<repo>, registers it with labels self-hosted,ovh1, and installs it
#     as a systemd service with resource limits (memory, CPU, tasks) via a drop-in
#   * `hostkey` makes an ed25519 key per project host and an ~/.ssh/config alias WITHOUT IdentityFile:
#     the private key goes into the GitHub Environment secret STAGEDIRECTOR_SSH_KEY and is then deleted
#     here, so jobs only get it through the environment lock.
#
# It never touches the other sites on ovh1, Docker, or any firewall.

set -euo pipefail

RUNNER_USER="stagedirector-runner"
RUNNER_HOME="/srv/stagedirector"
RUNNER_VERSION="2.321.0"
# Set RUNNER_VERSION to the current release and paste its sha256 for actions-runner-linux-x64-<version>.tar.gz
# from https://github.com/actions/runner/releases (the release notes list it). Left blank on purpose.
RUNNER_SHA256="${RUNNER_SHA256:-}"
LABELS="self-hosted,ovh1"

# Limits for each runner service (ovh1 has ~2 GB free and hosts client sites).
MEM_HIGH="700M"     # throttle above this
MEM_MAX="900M"      # hard cap; the job is killed above this
CPU_QUOTA="100%"    # one core
TASKS_MAX="256"
IO_WEIGHT="50"      # below default 100, so sites win disk contention

die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || die "run as root (sudo bash $0 ...)"

ensure_user() {
  if ! id "$RUNNER_USER" >/dev/null 2>&1; then
    info "Creating user $RUNNER_USER"
    useradd --system --create-home --home-dir "$RUNNER_HOME" --shell /bin/bash "$RUNNER_USER"
  fi
  passwd -l "$RUNNER_USER" >/dev/null
  install -d -m 700 -o "$RUNNER_USER" -g "$RUNNER_USER" "$RUNNER_HOME/.ssh" "$RUNNER_HOME/runners"
  touch "$RUNNER_HOME/.ssh/config" "$RUNNER_HOME/.ssh/known_hosts"
  chown "$RUNNER_USER:$RUNNER_USER" "$RUNNER_HOME/.ssh/config" "$RUNNER_HOME/.ssh/known_hosts"
  chmod 600 "$RUNNER_HOME/.ssh/config" "$RUNNER_HOME/.ssh/known_hosts"
  # Never in docker or sudo groups: a job must not get root on ovh1.
  if id -nG "$RUNNER_USER" | tr ' ' '\n' | grep -qxE 'docker|sudo|adm|wheel'; then
    die "$RUNNER_USER is in a privileged group (docker/sudo/adm). Remove it first."
  fi
}

ensure_packages() {
  local need=()
  for p in git jq rsync curl python3 openssh-client; do command -v "$p" >/dev/null || need+=("$p"); done
  python3 -c 'import yaml' 2>/dev/null || need+=(python3-yaml)
  if [ "${#need[@]}" -gt 0 ]; then info "Installing ${need[*]}"; apt-get update -q; apt-get install -y -q "${need[@]}"; fi
  if ! command -v gh >/dev/null; then
    info "Installing GitHub CLI (gh) from cli.github.com apt repo"
    install -d -m 755 /etc/apt/keyrings
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
    chmod 644 /etc/apt/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list
    apt-get update -q; apt-get install -y -q gh
  fi
}

cmd_runner() {
  local repo="${1:-}" token="${2:-}"
  [[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "usage: $0 runner <owner/repo> <registration-token>"
  [ -n "$token" ] || die "registration token missing (repo Settings > Actions > Runners > New self-hosted runner)"
  ensure_user; ensure_packages

  local name="ovh1-${repo//\//-}" dir="$RUNNER_HOME/runners/${repo//\//__}"
  [ ! -e "$dir/.runner" ] || die "$dir is already registered. Remove it first: cd $dir && sudo ./svc.sh uninstall && sudo -u $RUNNER_USER ./config.sh remove"
  install -d -m 750 -o "$RUNNER_USER" -g "$RUNNER_USER" "$dir"

  [[ "$RUNNER_SHA256" =~ ^[0-9a-f]{64}$ ]] || die "set RUNNER_SHA256 (from the runner release page) at the top of this script first"
  local tgz="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
  info "Downloading runner $RUNNER_VERSION"
  sudo -u "$RUNNER_USER" curl -fsSL -o "$dir/$tgz" "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/$tgz"
  echo "$RUNNER_SHA256  $dir/$tgz" | sha256sum -c - || die "runner checksum mismatch"
  sudo -u "$RUNNER_USER" tar -xzf "$dir/$tgz" -C "$dir"; rm -f "$dir/$tgz"
  "$dir/bin/installdependencies.sh" >/dev/null

  info "Registering $name for $repo with labels $LABELS"
  sudo -u "$RUNNER_USER" bash -c 'cd "$1" && ./config.sh --unattended --url "https://github.com/$2" --token "$3" --name "$4" --labels "$5" --work _work --replace' \
    _ "$dir" "$repo" "$token" "$name" "$LABELS"

  (cd "$dir" && ./svc.sh install "$RUNNER_USER" >/dev/null)
  local unit; unit="$(cat "$dir/.service")"
  install -d "/etc/systemd/system/$unit.d"
  cat > "/etc/systemd/system/$unit.d/stagedirector-limits.conf" <<EOF
# Stage Director: keep jobs from starving the client sites on ovh1.
[Service]
MemoryHigh=$MEM_HIGH
MemoryMax=$MEM_MAX
CPUQuota=$CPU_QUOTA
TasksMax=$TASKS_MAX
IOWeight=$IO_WEIGHT
Nice=10
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ProtectHome=yes
EOF
  systemctl daemon-reload
  (cd "$dir" && ./svc.sh start >/dev/null)
  info "Runner service $unit running. Check: systemctl status $unit"
  info "In GitHub, the runner shows under Settings > Actions > Runners with labels: $LABELS"
}

cmd_hostkey() {
  local project="${1:-}" alias="${2:-}" target="${3:-}" port="${4:-22}"
  [[ "$project" =~ ^[a-z0-9-]+$ ]] || die "usage: $0 hostkey <project> <ssh-host-alias> <user@host> [port]"
  [[ "$alias" =~ ^[A-Za-z0-9_.-]+$ ]] || die "bad alias"
  [[ "$target" =~ ^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$ ]] || die "target must be user@host"
  [[ "$port" =~ ^[0-9]+$ ]] || die "bad port"
  ensure_user
  local user="${target%@*}" host="${target#*@}" keydir key
  keydir="$(sudo -u "$RUNNER_USER" mktemp -d)"; key="$keydir/id_ed25519"
  sudo -u "$RUNNER_USER" ssh-keygen -q -t ed25519 -N '' -C "stagedirector-$project@ovh1" -f "$key"

  if ! grep -qE "^Host $alias\$" "$RUNNER_HOME/.ssh/config"; then
    cat >> "$RUNNER_HOME/.ssh/config" <<EOF

# Stage Director: $project. Key comes from the GitHub Environment secret via ssh-agent, never from disk.
Host $alias
  HostName $host
  User $user
  Port $port
  IdentitiesOnly no
  StrictHostKeyChecking yes
  ServerAliveInterval 30
EOF
  fi
  info "Host key of $host (check the fingerprint against your host's panel before trusting it):"
  ssh-keyscan -p "$port" -t ed25519,rsa "$host" 2>/dev/null | tee -a "$RUNNER_HOME/.ssh/known_hosts" | ssh-keygen -lf - || true

  cat <<EOF

==================== do these by hand ====================
1. Add this PUBLIC key on the host ($target), e.g. Hostinger hPanel > SSH Access > SSH keys:

$(cat "$key.pub")

2. Put the PRIVATE key into GitHub, as an ENVIRONMENT secret (not a repo secret):
   repo > Settings > Environments > stagedirector-<stage> > Add secret
   name: STAGEDIRECTOR_SSH_KEY   value: (contents below, including the BEGIN/END lines)
   Use one key per stage if staging and live are separate accounts; for one Hostinger account,
   add the same key to both stagedirector-staging and stagedirector-live.

$(cat "$key")

3. Press Enter here after copying it. The private key is then deleted from ovh1.
==========================================================
EOF
  read -r _
  shred -u "$key" 2>/dev/null || rm -f "$key"
  rm -rf "$keydir"
  info "Private key deleted from ovh1. Alias '$alias' is in $RUNNER_HOME/.ssh/config."
}

cmd_status() {
  id "$RUNNER_USER" || true
  systemctl list-units --type=service --all 'actions.runner.*' --no-pager || true
  for d in /etc/systemd/system/actions.runner.*.d; do [ -d "$d" ] && { echo "$d"; cat "$d"/*.conf; }; done
}

case "${1:-}" in
  runner)  shift; cmd_runner "$@" ;;
  hostkey) shift; cmd_hostkey "$@" ;;
  status)  cmd_status ;;
  *) sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
