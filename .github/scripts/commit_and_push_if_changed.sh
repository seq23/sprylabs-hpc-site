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
DISPATCH_CONFIRM_ATTEMPTS="${DISPATCH_CONFIRM_ATTEMPTS:-12}"
DISPATCH_CONFIRM_DELAY_SECONDS="${DISPATCH_CONFIRM_DELAY_SECONDS:-5}"
DISPATCH_REQUEST_ATTEMPTS="${DISPATCH_REQUEST_ATTEMPTS:-3}"
REF_SETTLE_ATTEMPTS="${REF_SETTLE_ATTEMPTS:-12}"
REF_SETTLE_DELAY_SECONDS="${REF_SETTLE_DELAY_SECONDS:-5}"

gh_api_get() {
  # Prints the response body; returns non-zero on any non-200 so a failed read is
  # never mistaken for an answer.
  local path="$1" token="$2" api="$3"
  local body status
  body="$(mktemp)"
  status="$(curl -sS -o "$body" -w '%{http_code}' \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${token}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${api}${path}" || echo 000)"
  if [ "$status" != "200" ]; then
    rm -f "$body"
    return 1
  fi
  cat "$body"
  rm -f "$body"
  return 0
}

# Does a Validate Repo run exist whose head_sha is exactly this commit? Asked by
# exact-SHA query, which is an indexed lookup rather than a scan of a paginated
# branch listing - the same correction made in check_main_validation_coverage.mjs
# and for the same reason.
validate_run_exists_for_sha() {
  local sha="$1" token="$2" repo="$3" api="$4"
  local json
  json="$(gh_api_get "/repos/${repo}/actions/runs?head_sha=${sha}&per_page=100" "$token" "$api")" || return 2
  printf '%s' "$json" | node -e '
    let raw = "";
    process.stdin.on("data", (d) => (raw += d));
    process.stdin.on("end", () => {
      let parsed;
      try { parsed = JSON.parse(raw); } catch { process.exit(2); }
      const runs = Array.isArray(parsed.workflow_runs) ? parsed.workflow_runs : null;
      if (!runs) process.exit(2);
      const hit = runs.some((r) => r.path === ".github/workflows/validate-repo.yml");
      process.exit(hit ? 0 : 1);
    });
  '
}

# Wait for GitHub to agree that main is where we just pushed it. This is the step
# whose absence produced the 2026-09-14 miss.
wait_for_ref_to_carry_sha() {
  local sha="$1" token="$2" repo="$3" api="$4"
  local attempt=1 seen
  while [ "$attempt" -le "$REF_SETTLE_ATTEMPTS" ]; do
    seen="$(gh_api_get "/repos/${repo}/commits/main" "$token" "$api" | node -e '
      let raw = "";
      process.stdin.on("data", (d) => (raw += d));
      process.stdin.on("end", () => {
        try { process.stdout.write(String(JSON.parse(raw).sha || "")); } catch { process.stdout.write(""); }
      });
    ' || true)"
    if [ "$seen" = "$sha" ]; then
      echo "MAIN-VALIDATION-DISPATCH ref settled: the API reports main at ${sha} after ${attempt} read(s)"
      return 0
    fi
    echo "MAIN-VALIDATION-DISPATCH ref not settled yet (attempt ${attempt}/${REF_SETTLE_ATTEMPTS}): the API still reports main at '${seen:-<unreadable>}', not ${sha}"
    attempt=$((attempt + 1))
    [ "$attempt" -le "$REF_SETTLE_ATTEMPTS" ] && sleep "$REF_SETTLE_DELAY_SECONDS"
  done
  echo "MAIN-VALIDATION-DISPATCH ref never settled on ${sha}; dispatching anyway and confirming by head_sha below" >&2
  return 1
}

post_validation_dispatch() {
  local token="$1" repo="$2" api="$3" pushed_sha="$4"
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
    rm -f "$body"
    return 0
  fi
  echo "MAIN-VALIDATION-DISPATCH FAILED for ${workflow_id}: HTTP ${http_status} requesting Validate Repo for ${pushed_sha}" >&2
  cat "$body" >&2 || true
  rm -f "$body"
  return 1
}

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

  # A run may already cover this SHA - a replay path can come through here twice.
  # Confirming first costs one read and makes the whole function idempotent.
  if validate_run_exists_for_sha "$pushed_sha" "$token" "$repo" "$api"; then
    echo "MAIN-VALIDATION-DISPATCH ok for ${workflow_id}: a Validate Repo run already covers ${pushed_sha}"
    return 0
  fi

  local request=1
  while [ "$request" -le "$DISPATCH_REQUEST_ATTEMPTS" ]; do
    wait_for_ref_to_carry_sha "$pushed_sha" "$token" "$repo" "$api" || true

    if ! post_validation_dispatch "$token" "$repo" "$api" "$pushed_sha"; then
      return 1
    fi
    echo "MAIN-VALIDATION-DISPATCH requested (attempt ${request}/${DISPATCH_REQUEST_ATTEMPTS}) for ${workflow_id}: Validate Repo on main, expecting head_sha ${pushed_sha}"

    local confirm=1
    while [ "$confirm" -le "$DISPATCH_CONFIRM_ATTEMPTS" ]; do
      if validate_run_exists_for_sha "$pushed_sha" "$token" "$repo" "$api"; then
        echo "MAIN-VALIDATION-DISPATCH ok for ${workflow_id}: confirmed a Validate Repo run whose head_sha is ${pushed_sha}"
        return 0
      fi
      confirm=$((confirm + 1))
      [ "$confirm" -le "$DISPATCH_CONFIRM_ATTEMPTS" ] && sleep "$DISPATCH_CONFIRM_DELAY_SECONDS"
    done

    echo "MAIN-VALIDATION-DISPATCH unconfirmed for ${workflow_id}: the dispatch was accepted but after ${DISPATCH_CONFIRM_ATTEMPTS} read(s) no Validate Repo run has head_sha ${pushed_sha}. This is the 2026-09-14 f7572445d shape - the dispatch resolved main to an older commit. Re-requesting." >&2
    request=$((request + 1))
  done

  echo "MAIN-VALIDATION-DISPATCH FAILED for ${workflow_id}: ${DISPATCH_REQUEST_ATTEMPTS} dispatch(es) were accepted and none produced a Validate Repo run covering ${pushed_sha}. main has advanced and nothing is validating it." >&2
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

# CONVERGE BEFORE COMMITTING, AT THE CHOKE POINT.
#
# The convergence loop was originally added inline to spry-content-release.yml
# by #46. That fixed one lane. On 2026-09-01 the identical defect returned
# through daily-citation-intelligence.yml, which rewrote 2,018 page HTML files
# and pushed them with no convergence and no ledger re-derivation - turning
# Validate Repo, Spry Content Release and the Main Validation Sentinel red at
# once.
#
# The argument this script already makes for validation dispatch applies without
# change to convergence: every main-writing workflow routes its push through
# here, so converging here covers all present writers and any future one for
# free, and there is no per-workflow step an author can forget to add.
#
# It runs inside commit_generated_changes so it also covers the replay path -
# regenerate_after_remote_advance re-runs the lane and comes back through here.
#
# A convergence failure must never be swallowed: an unconverged tree is exactly
# what this exists to stop reaching main.
converge_before_commit() {
  local script
  script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/converge_tree_before_commit.sh"
  if [ ! -x "$script" ]; then
    echo "CONVERGENCE UNAVAILABLE for ${workflow_id}: ${script} is missing or not executable, so the tree about to be committed cannot be proved to be the generators' fixed point." >&2
    return 1
  fi
  bash "$script" "$workflow_id"
}

commit_generated_changes() {
  if ! converge_before_commit; then
    echo "Refusing to commit for ${workflow_id}: the tree did not converge, so publishing it would land pages the downstream generators disagree with." >&2
    exit 1
  fi
  # STAGE THE RELEASE, NOT THE RUN'S ATTESTATIONS ABOUT ITSELF.
  #
  # This was a bare `git add -A`. It is the single choke point every
  # main-writing lane funnels through, so whatever a lane happens to leave in
  # the working tree lands on main - including per-run evidence that the next
  # run then reads back as if it were its own. That is how
  # artifacts/validation/lastmod-derivation-receipt.json reached main at
  # 93977956f and turned Spry Content Release red every scheduled day: run
  # 33767079923 read a receipt a different run had written and concluded it had
  # re-derived the sitemap ledger itself.
  #
  # THE EXCLUSION IS DELIBERATELY NARROW, and the width was measured rather than
  # guessed. Most of artifacts/validation/ IS consumed across runs and must keep
  # being staged - validate_content_ownership_boundaries.mjs reads
  # pre-implementation-protected-hashes.json with no fallback,
  # validate_workflow_artifacts.mjs and validate_workflow_runtime_mutations.mjs
  # read workflow-yaml-inventory.json, trace_traffic_qualified_pipeline.mjs reads
  # daily-citation-release-plan.json, build_navigation_structure.mjs reads
  # internal-navigation-structure.json. Excluding the directory wholesale would
  # freeze inputs that validators read, which is a worse defect than the one
  # being fixed, and it would let this step publish nothing while exiting 0.
  #
  # Receipts are the one shape in there that is never an input. A receipt is an
  # assertion about the process that wrote it, so a receipt outliving that
  # process can only mislead the next reader. Nothing consults one across a run
  # boundary, by construction.
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
