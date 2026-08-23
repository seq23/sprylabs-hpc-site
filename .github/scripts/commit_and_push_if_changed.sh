#!/usr/bin/env bash
set -Eeuo pipefail

message="${1:-Run governed workflow}"
workflow_id="${2:-unknown}"
workflow_argv="${WORKFLOW_ARGV:-}"
pre_push_validation_argv="${PRE_PUSH_VALIDATION_ARGV:-}"
max_push_attempts="${PUSH_RETRY_ATTEMPTS:-3}"
push_retry_delay_seconds="${PUSH_RETRY_DELAY_SECONDS:-2}"

echo "workflow_id=${workflow_id}"
echo "workflow_argv=${workflow_argv}"
echo "pre_push_validation_argv=${pre_push_validation_argv}"
echo "push_retry_attempts=${max_push_attempts}"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

fetch_remote_main() {
  git fetch origin main
}

run_governed_workflow_again() {
  if [ -z "$workflow_argv" ]; then
    echo "WORKFLOW_ARGV is required for safe replay of ${workflow_id}; refusing to guess a recovery command" >&2
    return 2
  fi
  bash -lc "$workflow_argv"
}

regenerate_after_remote_advance() {
  echo "Regenerating governed workflow ${workflow_id} after remote main advance"
  local replay_patch
  replay_patch="$(mktemp)"
  git diff --binary origin/main...HEAD -- data/report_fixes/agent_runs > "$replay_patch"
  git reset --hard origin/main
  git clean -fd
  if [ -s "$replay_patch" ]; then
    git apply "$replay_patch"
  fi
  rm -f "$replay_patch"
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

validate_committed_candidate() {
  if [ -z "$pre_push_validation_argv" ]; then
    echo "No workflow-specific pre-push gate configured for ${workflow_id}"
    return 0
  fi
  local candidate_sha gate_status cycle=1
  while [ "$cycle" -le 3 ]; do
    candidate_sha="$(git rev-parse HEAD)"
    echo "Validating exact candidate ${candidate_sha} before push (cycle ${cycle}/3)"
    gate_status=0
    VALIDATED_COMMIT_SHA="$candidate_sha" bash -lc "$pre_push_validation_argv" || gate_status=$?
    if [ "$(git rev-parse HEAD)" != "$candidate_sha" ]; then
      echo "Candidate HEAD changed during validation; refusing push" >&2
      return 3
    fi
    if [ "$gate_status" -eq 0 ]; then return 0; fi
    if git diff --quiet && git diff --cached --quiet; then
      echo "Pre-push gate failed without a repairable worktree change" >&2
      return "$gate_status"
    fi
    git add -A
    git commit --amend --no-edit
    cycle=$((cycle + 1))
  done
  echo "Pre-push gate did not converge after 3 exact-candidate cycles" >&2
  return 4
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
  local status=0
  git push origin HEAD:main 2> "$log_file" || status=$?
  cat "$log_file" >&2
  return "$status"
}

fetch_remote_main
if ! git merge-base --is-ancestor origin/main HEAD; then
  regenerate_after_remote_advance
fi

if ! commit_generated_changes; then
  exit 0
fi
validate_committed_candidate

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
    validate_committed_candidate
  else
    echo "Transient push failure; retrying without destructive replay for ${workflow_id}" >&2
    sleep "$push_retry_delay_seconds"
  fi

  attempt=$((attempt + 1))
done
