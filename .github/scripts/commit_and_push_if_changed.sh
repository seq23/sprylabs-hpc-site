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

# A push made with GITHUB_TOKEN does not create a push event, so `on: push:
# branches: [main]` in Validate Repo is structurally unreachable for every
# automated writer. That is not a theory: all nine github-actions[bot] commits on
# main have zero Validate Repo runs, while every human commit has one. b3aec016c
# ("zero-dollar citation intelligence: autonomous gap fill") landed three minutes
# after the last green run and left main failing three validators for over two
# hours with nothing to notice it.
#
# workflow_dispatch is the documented exception to that recursion guard: the API
# honours it when called with GITHUB_TOKEN. Every main-writing workflow already
# routes its push through this one script, so requesting validation here covers
# all present writers and any future one for free - there is no per-workflow step
# an author can forget to add.
#
# A dispatch that cannot be requested is a hard failure. Returning zero here
# would restore the exact silence this exists to remove: main advanced, and
# nothing is coming to check it.
request_main_validation() {
  local pushed_sha
  pushed_sha="$(git rev-parse HEAD)"
  local token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
  local repo="${GITHUB_REPOSITORY:-}"
  local api="${GITHUB_API_URL:-https://api.github.com}"

  if [ -z "$token" ] || [ -z "$repo" ]; then
    echo "MAIN-VALIDATION-DISPATCH FAILED for ${workflow_id}: GITHUB_TOKEN and GITHUB_REPOSITORY are required to request validation of ${pushed_sha}, and main has already advanced. Add 'actions: write' permission and GITHUB_TOKEN to the calling workflow." >&2
    return 1
  fi

  local body http_status
  body="$(mktemp)"
  http_status="$(curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${token}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${api}/repos/${repo}/actions/workflows/validate-repo.yml/dispatches" \
    -d '{"ref":"main"}' || echo 000)"

  if [ "$http_status" = "204" ]; then
    echo "MAIN-VALIDATION-DISPATCH ok for ${workflow_id}: requested Validate Repo on main covering ${pushed_sha}"
    rm -f "$body"
    return 0
  fi

  echo "MAIN-VALIDATION-DISPATCH FAILED for ${workflow_id}: HTTP ${http_status} requesting Validate Repo for ${pushed_sha}" >&2
  cat "$body" >&2 || true
  rm -f "$body"
  return 1
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
    # main has advanced. Nothing else will ask for validation of what just
    # landed, so ask here, and fail the run if the request cannot be made.
    request_main_validation
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
