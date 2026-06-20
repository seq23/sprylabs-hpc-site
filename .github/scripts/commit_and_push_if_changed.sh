#!/usr/bin/env bash
set -euo pipefail

message="${1:?commit message required}"
workflow_id="${2:?governed workflow id required}"
remote="${GIT_REMOTE:-origin}"
branch="${GIT_BRANCH:-main}"
max_attempts="${GIT_PUSH_RETRY_COUNT:-3}"

unstage_ephemeral_outputs() {
  if [[ -z "${GIT_RESTORE_TARGETS:-}" ]]; then
    return 0
  fi

  local targets=()
  # shellcheck disable=SC2206
  targets=(${GIT_RESTORE_TARGETS})
  git reset -q HEAD -- "${targets[@]}" 2>/dev/null || true
}

stage_generated_changes() {
  git add -A
  unstage_ephemeral_outputs
}

commit_generated_changes() {
  stage_generated_changes
  if git diff --cached --quiet; then
    return 1
  fi
  git commit -m "$message"
}

regenerate_from_current_remote() {
  echo "Remote branch advanced; discarding stale generated commit"
  git reset --hard "$remote/$branch"
  git clean -fd

  echo "Regenerating governed workflow '$workflow_id' from current $remote/$branch"
  node - "$workflow_id" <<'NODE'
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');

const workflowId = process.argv[2];
const payload = JSON.parse(fs.readFileSync('data/workflows/workflow_contracts.json', 'utf8'));
const contract = (payload.governed_workflows || []).find(item => item.id === workflowId);

if (!contract) {
  console.error(`Unknown governed workflow: ${workflowId}`);
  process.exit(2);
}
if (!Array.isArray(contract.workflow_argv) || contract.workflow_argv.length < 3) {
  console.error(`${workflowId}: workflow_argv is missing or invalid`);
  process.exit(2);
}

const args = [
  'run',
  'workflow:run',
  '--',
  '--workflow',
  workflowId,
  '--',
  'npm',
  'run',
  'programmatic:run-lane',
  '--',
  '--lane',
  contract.lane,
  '--',
  ...contract.workflow_argv,
];

const result = spawnSync('npm', args, {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
NODE
}

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

if ! commit_generated_changes; then
  echo "No generated changes to commit"
  exit 0
fi

attempt=1
while [[ "$attempt" -le "$max_attempts" ]]; do
  echo "Push attempt $attempt/$max_attempts"
  git fetch "$remote" "$branch"

  if ! git merge-base --is-ancestor "$remote/$branch" HEAD; then
    regenerate_from_current_remote
    if ! commit_generated_changes; then
      echo "Remote already contains an equivalent generated state"
      exit 0
    fi
  fi

  if git push "$remote" HEAD:"$branch"; then
    echo "Push succeeded"
    exit 0
  fi

  attempt=$((attempt + 1))
  sleep 2
done

echo "Push failed after $max_attempts attempts"
exit 1
