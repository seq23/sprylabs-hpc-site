#!/usr/bin/env bash
set -euo pipefail
message="${1:?commit message required}"
remote="${GIT_REMOTE:-origin}"
branch="${GIT_BRANCH:-main}"
max_attempts="${GIT_PUSH_RETRY_COUNT:-3}"
if [[ -n "${GIT_RESTORE_TARGETS:-}" ]]; then
  # shellcheck disable=SC2086
  git restore ${GIT_RESTORE_TARGETS} || true
fi
if git diff --quiet && git diff --cached --quiet; then
  echo "No changes to commit"
  exit 0
fi
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then
  echo "No staged changes"
  exit 0
fi
git commit -m "$message"
attempt=1
while [[ "$attempt" -le "$max_attempts" ]]; do
  echo "Push attempt $attempt/$max_attempts"
  git fetch "$remote" "$branch"
  if git rebase "$remote/$branch"; then
    if git push "$remote" HEAD:"$branch"; then
      echo "Push succeeded"
      exit 0
    fi
  else
    git rebase --abort || true
    echo "Rebase failed"
    exit 1
  fi
  attempt=$((attempt+1))
  sleep 2
done
echo "Push failed after $max_attempts attempts"
exit 1
