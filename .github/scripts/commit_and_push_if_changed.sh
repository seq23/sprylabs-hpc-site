#!/usr/bin/env bash
set -Eeuo pipefail

message="${1:-Run governed workflow}"
workflow_id="${2:-unknown}"
workflow_argv="${WORKFLOW_ARGV:-}"
max_push_attempts="${PUSH_RETRY_ATTEMPTS:-3}"

echo "workflow_id=${workflow_id}"
echo "workflow_argv=${workflow_argv}"
echo "push_retry_attempts=${max_push_attempts}"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

fetch_remote_main() {
  # GitHub checkout uses fetch-depth: 0 for full history, but raw git does not
  # accept a zero-depth flag. Fetch the remote branch without that invalid flag.
  git fetch origin main
}

run_governed_workflow_again() {
  if [ -n "$workflow_argv" ]; then
    bash -lc "$workflow_argv"
    return
  fi

  mapfile -d '' -t rerun_argv < <(node - "$workflow_id" <<'NODE'
const fs = require('fs');
const workflowId = process.argv[2];
const contracts = JSON.parse(fs.readFileSync('data/workflows/workflow_contracts.json', 'utf8')).governed_workflows || [];
const contract = contracts.find((item) => item.id === workflowId);
if (!contract) {
  console.error(`No governed workflow contract found for ${workflowId}`);
  process.exit(1);
}
const args = [
  'npm', 'run', 'workflow:run', '--',
  '--workflow', contract.id, '--',
  'npm', 'run', 'programmatic:run-lane', '--',
  '--lane', contract.lane, '--',
  ...contract.workflow_argv,
];
process.stdout.write(args.join('\0') + '\0');
NODE
  )
  "${rerun_argv[@]}"
}

regenerate_after_remote_advance() {
  echo "Regenerating governed workflow after remote advance"
  git reset --hard origin/main
  git clean -fd
  run_governed_workflow_again
}

commit_generated_changes() {
  git add -A
  if git diff --cached --quiet; then
    echo "No generated changes to commit for ${workflow_id}"
    return 1
  fi
  git commit -m "$message"
  return 0
}

fetch_remote_main
if ! git merge-base --is-ancestor origin/main HEAD; then
  regenerate_after_remote_advance
fi

if ! commit_generated_changes; then
  exit 0
fi

attempt=1
while [ "$attempt" -le "$max_push_attempts" ]; do
  echo "Push attempt ${attempt}/${max_push_attempts} for ${workflow_id}"
  if git push origin HEAD:main; then
    echo "Pushed generated changes for ${workflow_id}"
    exit 0
  fi

  if [ "$attempt" -eq "$max_push_attempts" ]; then
    echo "Push failed after ${max_push_attempts} attempt(s) for ${workflow_id}" >&2
    exit 1
  fi

  fetch_remote_main
  regenerate_after_remote_advance
  if ! commit_generated_changes; then
    echo "Remote already contains equivalent generated state for ${workflow_id}"
    exit 0
  fi
  attempt=$((attempt + 1))
done
