#!/usr/bin/env bash
# Copy live WordPress content into staging (DB + media). Not a code deploy.
#
# Contract: engine/contract.md → tools.copyLiveToStaging
# Cutover:  engine/examples/mariasplace/CUTOVER.md
#
# Install in the Maria's Place repo as scripts/copy-live-to-staging.sh and set
#   tools.copyLiveToStaging: scripts/copy-live-to-staging.sh
# in stagedirector.yml. Fill in LIVE_* / STAGING_* paths for Hostinger before use.
#
# Exit: 0 = staging holds the copy; 2 = refused, nothing touched; 1 = failed mid-way.
set -euo pipefail

die() { echo "copy-live: $*" >&2; exit 2; }
fail() { echo "copy-live: $*" >&2; exit 1; }

[ "${STAGEDIRECTOR:-}" = 1 ] || die "run only under Stage Director (STAGEDIRECTOR=1)"
STAGE="${STAGEDIRECTOR_STAGE:-}"
[ "$STAGE" = staging ] || die "destination must be staging (got '${STAGE:-empty}')"

# --- project paths (edit for the real Hostinger layout) ------------------------
# Both sites are reached with the same ssh alias Stage Director already uses for deploy.
SSH_HOST="${COPY_LIVE_SSH:-hostinger}"
LIVE_ROOT="${COPY_LIVE_LIVE_ROOT:-domains/mariasplace.com/public_html}"
STAGING_ROOT="${COPY_LIVE_STAGING_ROOT:-domains/staging.mariasplace.com/public_html}"
# Tables that hold "recent live content" for preview. Keep options/users out unless
# you intentionally want them (they overwrite staging config and accounts).
TABLES=(
  wp_posts
  wp_postmeta
  wp_terms
  wp_term_taxonomy
  wp_term_relationships
  wp_comments
  wp_commentmeta
  # registrations / form plugins — add the real table names before first run:
  # wp_fluentform_submissions
  # wp_fluentform_entry_details
)

ID="$(date -u +%Y%m%dT%H%M%SZ)"
echo "Planned sync live → staging ($ID)"
echo "  ssh:     $SSH_HOST"
echo "  live:    $LIVE_ROOT"
echo "  staging: $STAGING_ROOT"
echo "  tables:  ${TABLES[*]}"
echo "  media:   wp-content/uploads (rsync, no deletes on staging)"

remote() { ssh "$SSH_HOST" "$@"; }

# Dump selected tables from live.
DUMP="/tmp/sd-copy-live-$ID.sql"
remote "cd '$LIVE_ROOT' && wp db export - --tables=$(IFS=,; echo "${TABLES[*]}")" > "$DUMP" \
  || fail "could not export live tables"

# Import into staging (overwrites those tables only).
remote "cd '$STAGING_ROOT' && wp db import -" < "$DUMP" \
  || fail "could not import into staging"
rm -f "$DUMP"

# Media: add/update files present on live; do not delete staging-only uploads.
remote "rsync -a --ignore-existing '$LIVE_ROOT/wp-content/uploads/' '$STAGING_ROOT/wp-content/uploads/'" \
  || fail "uploads rsync failed"

# Point URLs at staging so preview links work.
remote "cd '$STAGING_ROOT' && wp search-replace 'https://mariasplace.com' 'https://staging.mariasplace.com' --all-tables --skip-columns=guid" \
  || fail "search-replace failed"

echo "STAGEDIRECTOR_COPY_LIVE=$ID"
echo "copy-live: staging updated ($ID). Preview https://staging.mariasplace.com/"
