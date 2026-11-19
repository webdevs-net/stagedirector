#!/usr/bin/env bash
# Tell Stage Director which commit a stage now runs, after a deploy made OUTSIDE
# Stage Director (e.g. `scripts/deploy.sh staging` from a terminal).
#
#   engine/kits/report-deploy.sh <stage> [commit]     # commit defaults to HEAD
#
# Records a GitHub Deployment in the environment "observed-<stage>". That name is
# never a stage id, so the workflow's live gate (which reads environment=<stage>)
# ignores it: this record is display-only and can never unlock a push to live.
# Uses your own GitHub CLI login. Safe to call at the end of a project deploy
# script; it never fails the deploy (exits 0 with a warning on any problem).
set -uo pipefail
stage="${1:?usage: report-deploy.sh <stage> [commit]}"
commit="${2:-$(git rev-parse HEAD 2>/dev/null)}"
warn() { echo "report-deploy: $*" >&2; exit 0; }
[ -n "${STAGEDIRECTOR:-}" ] && exit 0 # inside a Stage Director run: the workflow records it already
[[ "$stage" =~ ^[A-Za-z0-9_-]+$ ]] || warn "bad stage id"
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || commit="$(git rev-parse --verify "$commit^{commit}" 2>/dev/null)" || warn "unknown commit"
command -v gh >/dev/null || warn "GitHub CLI not installed; Stage Director won't know about this deploy"
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null)" || warn "not a GitHub repo"
git fetch -q origin "$commit" 2>/dev/null
gh api "repos/$repo/commits/$commit" --silent 2>/dev/null || warn "commit ${commit:0:7} is not on GitHub yet: push it first"
ref="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "$commit")"
actor="$(gh api user --jq .login 2>/dev/null || echo unknown)"
id="$(jq -n --arg ref "$commit" --arg env "observed-$stage" --arg actor "$actor" --arg branch "$ref" \
  '{ref:$ref, environment:$env, auto_merge:false, required_contexts:[], transient_environment:true, production_environment:false,
    description:"Deployed outside Stage Director", payload:{stagedirector:1, observed:true, source:"terminal", actor:$actor, ref:$branch}}' \
  | gh api -X POST "repos/$repo/deployments" --input - --jq .id 2>/dev/null)" || warn "could not record the deploy"
gh api -X POST "repos/$repo/deployments/$id/statuses" -f state=success -f description="Reported from a terminal by $actor" --silent 2>/dev/null
echo "Stage Director: $stage now shows ${commit:0:7} ($ref, deployed by $actor)."
