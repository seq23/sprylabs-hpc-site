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
# automated writer. That is not a theory: b3aec016c ("zero-dollar citation
# intelligence: autonomous gap fill") landed three minutes after the last green
# run and left main failing three validators for over two hours with nothing to
# notice it.
#
# workflow_dispatch is the documented exception to that recursion guard: the API
# honours it when called with GITHUB_TOKEN. Every main-writing workflow already
# routes its push through this one script, so requesting validation here covers
# all present writers and any future one for free - there is no per-workflow step
# an author can forget to add.
#
# REQUESTING IS NOT COVERING, AND THE DIFFERENCE IS A RACE THAT HAS ALREADY FIRED.
#
# The request used to be a single POST of {"ref":"main"} that reported success on
# HTTP 204. But workflow_dispatch resolves a BRANCH NAME to a SHA on GitHub's
# side, at dispatch time, and that read can still be serving the pre-push tip
# seconds after the push returns. When it does, the dispatch is honoured, 204 is
# returned, a Validate Repo run starts - and it validates the PARENT commit. The
# commit that was just landed is covered by nothing, and this script said "ok".
#
# Reproduced in the record on 2026-09-14: f7572445d64a28a061a658ed5cd74f0f071c5f9a
# was pushed at 14:45:13Z, this function dispatched at 14:45:18Z and got its 204,
# and run 34857679581 started at 14:45:18Z pinned to bca354ff368897aa583baed1e82eac10802656cc,
# its parent. An exact head_sha query returns total_count 0 for f7572445d to this
# day: that commit sat on main for 23 hours validated by nothing, and only escaped
# an alarm because the next release replaced it before the sentinel next looked.
#
# So the unit of success is not the HTTP status of the request. It is the
# existence of a Validate Repo run whose head_sha IS the commit just pushed -
# which is exactly, and deliberately, the same predicate the Main Validation
# Sentinel checks. This function now establishes that predicate rather than
# hoping for it:
#
#   1. wait until the API's own view of main actually reports the pushed SHA,
#      so the dispatch cannot be resolved against a ref that has not moved;
#   2. dispatch;
#   3. wait for a Validate Repo run whose head_sha is the pushed SHA to exist;
#   4. if none appears, re-dispatch, bounded.
#
# The alternative shape - pass the SHA as a workflow input and have Validate Repo
# check it out - was rejected. The run's head_sha would still be the branch tip,
# so the run would CLAIM to have validated a commit it did not test, and the
# sentinel's coverage rule would have to be loosened to accept it. That trades a
# race for a lie.
#
# A dispatch that cannot be confirmed is a hard failure. Returning zero here
# would restore the exact silence this exists to remove: main advanced, and
# nothing is coming to check it.
#
# THE LOOP ITSELF LIVES IN workflow_dispatch_lib.sh, NOT HERE. The same
# recursion guard that hides a GITHUB_TOKEN push also hides the workflow_run
# event of a GITHUB_TOKEN-dispatched run, so the Validate Repo run this function
# requests cannot in turn start Deploy Distribution or the Main Validation
# Sentinel (found 2026-09-18 and 2026-09-20: run 35544558796 validated ad7beb69f
# and chained nothing; every automated release since the sentinel was added was
# validated and never submitted to IndexNow). Validate Repo now hands off to
# those consumers through .github/scripts/handoff_validated_main_to_consumers.sh
# with the same request/confirm/re-request predicate, and one implementation
# shared by both callers is the only way the two stay the same.
# shellcheck source=workflow_dispatch_lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/workflow_dispatch_lib.sh"

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

  if request_workflow_run_for_sha validate-repo.yml "$pushed_sha" '{}' "$token" "$repo" "$api" main "MAIN-VALIDATION-DISPATCH"; then
    return 0
  fi
  echo "MAIN-VALIDATION-DISPATCH FAILED for ${workflow_id}: no Validate Repo run covers ${pushed_sha}. main has advanced and nothing is validating it." >&2
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
  # 7 Nov 2026: no convergence pass and no pre-push page validator. The in-repo
  # content engine they re-ran (build:all) is retired; a lane commits exactly what
  # it wrote, and Validate Repo (lean safety gate) runs on the pushed commit.
  git add -A -- . ':(exclude)artifacts/validation/*receipt*.json'

  # SELF-PROVING, because a rule that silently does nothing is how this class of
  # defect survives. If a receipt is staged anyway - force-added, or the pathspec
  # edited into uselessness - say so and stop rather than commit it.
  staged_receipts="$(git diff --cached --name-only -- 'artifacts/validation/*receipt*.json')"
  if [ -n "$staged_receipts" ]; then
    echo "Refusing to commit for ${workflow_id}: per-run derivation receipts are staged, and committing one makes every later checkout read it as its own:" >&2
    echo "$staged_receipts" >&2
    exit 1
  fi

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
  local push_status=0
  git push origin HEAD:main 2> "$log_file" || push_status=$?
  cat "$log_file" >&2
  return "$push_status"
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
    #
    # The exit is explicit rather than left to `set -e`: this is the one place
    # where a swallowed failure puts an unvalidated commit on main and says
    # nothing, so it must not depend on a shell option a later edit could drop.
    if ! request_main_validation; then
      echo "Refusing to report success for ${workflow_id}: ${message} is on main but no validation could be requested for it." >&2
      exit 1
    fi
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
