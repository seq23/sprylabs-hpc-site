#!/usr/bin/env bash
set -Eeuo pipefail
message="${1:-Run governed workflow}"
workflow_id="${2:-unknown}"
workflow_argv="${WORKFLOW_ARGV:-}"
echo "workflow_id=${workflow_id}"
echo "workflow_argv=${workflow_argv}"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git fetch origin main --depth=0 || true
if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "Regenerating governed workflow after remote advance"
  git reset --hard origin/main
  git clean -fd
fi
git add -A
if git diff --cached --quiet; then
  echo "No generated changes to commit for ${workflow_id}"
  exit 0
fi
git commit -m "$message"
git push origin HEAD:main
