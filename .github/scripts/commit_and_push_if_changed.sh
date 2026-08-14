#!/usr/bin/env bash
set -Eeuo pipefail

message="${1:-Run governed workflow}"
workflow_id="${2:-unknown}"
workflow_argv="${WORKFLOW_ARGV:-}"
max_push_attempts="${PUSH_RETRY_ATTEMPTS:-3}"
push_retry_delay_seconds="${PUSH_RETRY_DELAY_SECONDS:-2}"

echo "workflow_id=${workflow_id}"
echo "workflow_argv=${workflow_argv}"
echo "push_retry_attempts=${max_push_attempts}"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

fetch_remote_main() {
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
  echo "Remote main advanced; regenerating ${workflow_id} from origin/main"
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

classify_push_failure() {
  local log_file="$1"
  if grep -Eqi '(non-fast-forward|fetch first|updates were rejected because the remote contains work|tip of your current branch is behind|failed to push some refs.*rejected)' "$log_file"; then
    printf '%s\n' remote_advance
    return
  fi
  if grep -Eqi '(connection reset|connection timed out|could not resolve host|temporary failure in name resolution|remote end hung up|rpc failed|http 5[0-9][0-9]|the requested url returned error: 5[0-9][0-9])' "$log_file"; then
    printf '%s\n' transient
    return
  fi
  printf '%s\n' non_retryable
}

push_main_once() {
  local log_file="$1"
  : > "$log_file"
  git push origin HEAD:main 2> >(tee "$log_file" >&2)
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
  push_log="$(mktemp)"
  push_status=0
  if push_main_once "$push_log"; then
    rm -f "$push_log"
    echo "Pushed generated changes for ${workflow_id}"
    exit 0
  else
    push_status=$?
  fi

  push_class="$(classify_push_failure "$push_log")"
  echo "Push failure classification for ${workflow_id}: ${push_class} (exit=${push_status})" >&2
  rm -f "$push_log"

  if [ "$push_class" = "non_retryable" ]; then
    echo "Push is not safely retryable; refusing reset/replay for ${workflow_id}" >&2
    exit "$push_status"
  fi

  if [ "$attempt" -eq "$max_push_attempts" ]; then
    echo "Push failed after ${max_push_attempts} attempt(s) for ${workflow_id}" >&2
    exit "$push_status"
  fi

  if [ "$push_class" = "remote_advance" ]; then
    fetch_remote_main
    regenerate_after_remote_advance
    if ! commit_generated_changes; then
      echo "Remote already contains equivalent generated state for ${workflow_id}"
      exit 0
    fi
  else
    echo "Transient push failure; retrying without destructive replay for ${workflow_id}" >&2
    sleep "$push_retry_delay_seconds"
  fi

  attempt=$((attempt + 1))
done
