#!/usr/bin/env bash
# Copy only the valuable live content into staging — not a full site clone.
# Not a code deploy (that stays scripts/deploy.sh).
#
# Contract: engine/contract.md → tools.copyLiveToStaging
# Cutover:  engine/examples/mariasplace/CUTOVER.md
#
# What this pulls (what Maria may have changed while she had the live site):
#   • Users + usermeta
#   • Posts + postmeta (pages, posts, Divi layouts stored as posts, attachments rows)
#   • Terms + term links (so page/post taxonomies still resolve)
#
# What this deliberately leaves alone on staging:
#   • wp_options (URLs, active plugins, staging-only settings)
#   • Comments, form/plugin tables, Woo tables — add below only if needed
#   • Theme/plugin/code files (deploy pipe)
#
# Install in the Maria's Place repo as scripts/copy-live-to-staging.sh and set
#   tools.copyLiveToStaging: scripts/copy-live-to-staging.sh
# Fill in LIVE_* / STAGING_* paths for Hostinger before use.
#
# Exit: 0 = staging holds the copy; 2 = refused, nothing touched; 1 = failed mid-way.
set -euo pipefail

die() { echo "copy-live: $*" >&2; exit 2; }
fail() { echo "copy-live: $*" >&2; exit 1; }

[ "${STAGEDIRECTOR:-}" = 1 ] || die "run only under Stage Director (STAGEDIRECTOR=1)"
STAGE="${STAGEDIRECTOR_STAGE:-}"
[ "$STAGE" = staging ] || die "destination must be staging (got '${STAGE:-empty}')"

# --- project paths (edit for the real Hostinger layout) ------------------------
SSH_HOST="${COPY_LIVE_SSH:-hostinger}"
LIVE_ROOT="${COPY_LIVE_LIVE_ROOT:-domains/mariasplace.com/public_html}"
STAGING_ROOT="${COPY_LIVE_STAGING_ROOT:-domains/staging.mariasplace.com/public_html}"

# Minimal valuable set. Prefix may be wp_ or something else — detect from live.
TABLES=(
  users
  usermeta
  posts
  postmeta
  terms
  term_taxonomy
  term_relationships
)

ID="$(date -u +%Y%m%dT%H%M%SZ)"
PREFIX="$(ssh "$SSH_HOST" "cd '$LIVE_ROOT' && wp config get table_prefix" | tr -d '\r')"
[ -n "$PREFIX" ] || die "could not read table_prefix from live"
NAMED=()
for t in "${TABLES[@]}"; do NAMED+=("${PREFIX}${t}"); done

echo "Planned sync live → staging ($ID) — valuable data only"
echo "  ssh:     $SSH_HOST"
echo "  live:    $LIVE_ROOT"
echo "  staging: $STAGING_ROOT"
echo "  tables:  ${NAMED[*]}"
echo "  skipped: ${PREFIX}options and everything else"
echo "  media:   uploads referenced by attachment posts (rsync, no deletes)"

remote() { ssh "$SSH_HOST" "$@"; }

DUMP="/tmp/sd-copy-live-$ID.sql"
remote "cd '$LIVE_ROOT' && wp db export - --tables=$(IFS=,; echo "${NAMED[*]}")" > "$DUMP" \
  || fail "could not export live tables"

remote "cd '$STAGING_ROOT' && wp db import -" < "$DUMP" \
  || fail "could not import into staging"
rm -f "$DUMP"

# Bring media files so pages/posts with images still render. Do not delete staging-only files.
remote "rsync -a --ignore-existing '$LIVE_ROOT/wp-content/uploads/' '$STAGING_ROOT/wp-content/uploads/'" \
  || fail "uploads rsync failed"

# Fix absolute URLs only in the tables we just replaced (not options — staging keeps its own).
remote "cd '$STAGING_ROOT' && wp search-replace 'https://mariasplace.com' 'https://staging.mariasplace.com' ${NAMED[*]} --skip-columns=guid" \
  || fail "search-replace failed"

echo "STAGEDIRECTOR_COPY_LIVE=$ID"
echo "copy-live: staging has live users + pages/posts ($ID). Preview https://staging.mariasplace.com/"
