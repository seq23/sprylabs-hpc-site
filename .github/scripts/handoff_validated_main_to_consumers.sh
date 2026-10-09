#!/usr/bin/env bash
set -Eeuo pipefail

# Runs as the last step of Validate Repo's `gate` job, after the
# spry-validated-<sha> artifact has been uploaded. Makes the workflows that
# consume a green Validate Repo run actually start when Validate Repo itself was
# started by workflow_dispatch.
#
# WHY A GREEN VALIDATE REPO RUN CAN LEAVE ITS CONSUMERS UNSTARTED.
#
# Deploy Distribution and Main Validation Sentinel are triggered by
# `workflow_run: workflows: ["Validate Repo"]`. That event is raised for a
# Validate Repo run that was started by a push. It is NOT raised for a Validate
# Repo run that was started by a workflow_dispatch made with GITHUB_TOKEN - the
# same recursion guard that stops a GITHUB_TOKEN push from raising a push event.
# Every automated writer in this repository pushes with GITHUB_TOKEN and then
# has commit_and_push_if_changed.sh dispatch Validate Repo for exactly that
# reason, so every automated release reaches Validate Repo by dispatch and every
# one of those green runs chained nothing:
#
#   2026-09-20 20:37Z  Validate Repo 35536144821 (push)      -> Deploy Distribution
#                      35536589767 and Sentinel 35536589839 within 9 minutes.
#   2026-09-20 23:24Z  Validate Repo 35544558796 (dispatch)  -> nothing, ever.
#   2026-09-19 13:36Z  Validate Repo 35446280764 (dispatch)  -> nothing, ever.
#
# Deploy Distribution is `npm run distribution:deploy` plus the Search Console
# submission, gated on that artifact. So every page the automation published was
# validated and never submitted to IndexNow or Search Console. Nothing was red,
# because nothing ran - the class of defect the Main Validation Sentinel was built
# to catch for Validate Repo, one hop further down.
#
# workflow_dispatch is the documented exception to the recursion guard, and
# Deploy Distribution has declared artifact_name / artifact_run_id / commit_sha
# dispatch inputs for exactly this hand-off since it was written; no run had ever
# used them (200 of 200 runs on record were workflow_run). This script uses them.
#
# WHAT IS DISPATCHED is not a list kept here. scripts/workflow/validate_repo_consumers.py
# derives the consumer set from the workflow files themselves - a workflow is a
# consumer because it says `workflow_run: workflows: ["Validate Repo"]` - and the
# guard (scripts/validation/validate_workflow_run_handoff.py) runs the same module,
# so a new consumer is handed off, or fails the guard, and cannot be quietly
# neither.
#
# HOW IT IS DISPATCHED is the request/confirm/re-request loop in
# workflow_dispatch_lib.sh, shared with the push helper, because the dispatch
# race it handles (f7572445d, 2026-09-14) applies here unchanged.
#
# EXIT CODES. 0 means either every consumer has a run whose head_sha is this
# commit, or a NAMED stop printed below (a push-started run or a dispatch made
# by a person, whose consumers the platform starts itself; a non-main ref, which
# has no consumers). Anything else
# is a failure of the gate: a validated commit whose consumers could not be
# started must not be reported as a clean validation, because that report is
# what hid this for a month.

token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
repo="${GITHUB_REPOSITORY:-}"
api="${GITHUB_API_URL:-https://api.github.com}"
sha="${GITHUB_SHA:-}"
run_id="${GITHUB_RUN_ID:-}"
event="${GITHUB_EVENT_NAME:-}"
actor="${GITHUB_ACTOR:-}"
ref="${GITHUB_REF:-}"
# The actor a GITHUB_TOKEN dispatch records. Read from the run record, not
# assumed: runs 35544558796, 35446280764 and every other helper-dispatched
# Validate Repo run carry actor == triggering_actor == github-actions[bot].
TOKEN_ACTOR="${HANDOFF_TOKEN_ACTOR:-github-actions[bot]}"
workflows_dir="${HANDOFF_WORKFLOWS_DIR:-.github/workflows}"
plan_file="${HANDOFF_PLAN_FILE:-artifacts/validation/validated-main-handoff-plan.json}"
receipt_file="${HANDOFF_RECEIPT_FILE:-artifacts/validation/validated-main-handoff.json}"
python_runtime="${HANDOFF_PYTHON_RUNTIME:-node scripts/validation/python_runtime.mjs run}"
LABEL="VALIDATED-MAIN-HANDOFF"

# shellcheck source=workflow_dispatch_lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/workflow_dispatch_lib.sh"

write_receipt() {
  local outcome="$1" detail="$2"
  mkdir -p "$(dirname "$receipt_file")"
  RECEIPT="$receipt_file" OUTCOME="$outcome" DETAIL="$detail" SHA="$sha" RUN_ID="$run_id" \
  EVENT="$event" ACTOR="$actor" REF="$ref" PLAN_FILE="$plan_file" node -e '
    const fs = require("node:fs");
    let plan = null;
    try { plan = JSON.parse(fs.readFileSync(process.env.PLAN_FILE, "utf8")); } catch {}
    fs.writeFileSync(process.env.RECEIPT, JSON.stringify({
      outcome: process.env.OUTCOME,
      detail: process.env.DETAIL,
      sha: process.env.SHA,
      validate_run_id: process.env.RUN_ID,
      event: process.env.EVENT,
      actor: process.env.ACTOR,
      ref: process.env.REF,
      consumers: plan ? plan.consumers.map((c) => ({ file: c.file, name: c.name, inputs: c.inputs })) : null,
      written_at: new Date().toISOString(),
    }, null, 2) + "\n");
  '
}

named_stop() {
  local reason="$1"
  echo "${LABEL} NAMED STOP: ${reason}"
  write_receipt "named_stop" "$reason"
  exit 0
}

fail() {
  local reason="$1"
  echo "${LABEL} FAILED: ${reason}" >&2
  write_receipt "failed" "$reason"
  exit 1
}

# The two stops that are legitimate, each named. Everything else falls through
# to the dispatch, or to a failure that says why.
if [ "$ref" != "refs/heads/main" ]; then
  named_stop "ref is '${ref}', not refs/heads/main; only main has validated-artifact consumers, so there is nothing to hand off."
fi
case "$event" in
  push)
    named_stop "this Validate Repo run was started by a push event, and a push-started run raises workflow_run itself; Deploy Distribution and the Main Validation Sentinel are started by the platform. Dispatching them here as well would run each twice."
    ;;
  workflow_dispatch)
    # Only a dispatch made WITH GITHUB_TOKEN is silenced. A person dispatching
    # from the UI or a PAT raises workflow_run like any other event - Validate
    # Repo 34714645220 (workflow_dispatch by seq23, 2c2debb36) started Deploy
    # Distribution 34715301733 by itself thirteen minutes later. Dispatching
    # here as well would run each consumer twice, so a human dispatch is a
    # named stop and only the token's own dispatches are handed off.
    if [ "$actor" != "$TOKEN_ACTOR" ]; then
      named_stop "this Validate Repo run was dispatched by '${actor:-<unset>}', not by ${TOKEN_ACTOR}; a workflow_dispatch made by a person raises workflow_run itself and the platform starts the consumers. Only a GITHUB_TOKEN dispatch is silenced, and only that is handed off here."
    fi
    ;;
  *)
    fail "this Validate Repo run was started by '${event:-<unset>}', which this hand-off does not know how to reason about. It refuses to guess whether the platform will raise workflow_run for it; add the case explicitly."
    ;;
esac

[ -n "$sha" ] || fail "GITHUB_SHA is unset; there is no commit to hand off."
[ -n "$run_id" ] || fail "GITHUB_RUN_ID is unset; the artifact cannot be named to a consumer."
if [ -z "$token" ] || [ -z "$repo" ]; then
  fail "GITHUB_TOKEN and GITHUB_REPOSITORY are required to dispatch the consumers of ${sha}. The gate job needs 'actions: write' and must pass GITHUB_TOKEN."
fi

# Derive the consumer set and the inputs each one takes. A non-zero exit here is
# a consumer that cannot be dispatched, and the plan has already said which.
mkdir -p "$(dirname "$plan_file")"
if ! $python_runtime scripts/workflow/validate_repo_consumers.py plan \
      --workflows-dir "$workflows_dir" --producer "Validate Repo" \
      --sha "$sha" --run-id "$run_id" --out "$plan_file" >/dev/null; then
  fail "the consumer plan could not be derived from ${workflows_dir}; see the errors above and ${plan_file}."
fi

consumer_count="$(PLAN_FILE="$plan_file" node -e '
  const p = JSON.parse(require("node:fs").readFileSync(process.env.PLAN_FILE, "utf8"));
  process.stdout.write(String(p.consumers.length));
')"
if [ "$consumer_count" -eq 0 ]; then
  fail "the plan lists zero consumers of Validate Repo; a hand-off to nothing must not report success."
fi
echo "${LABEL}: ${consumer_count} consumer(s) of Validate Repo to start for ${sha} (Validate Repo run ${run_id})"

# main must still be at the commit this run validated. If it has moved on, the
# newer commit's own Validate Repo run owns the hand-off (and its dispatch has
# already cancelled this run in every case but a narrow window). Dispatching now
# would create consumer runs pinned to a commit this run did not validate, and
# the confirm predicate below could never be met for them. Refuse, and say so.
if ! (REF_SETTLE_ATTEMPTS=1; REF_SETTLE_DELAY_SECONDS=0; wait_for_ref_to_carry_sha "$sha" "$token" "$repo" "$api" main "$LABEL"); then
  fail "main is no longer at ${sha}; the consumers of the newer commit are that commit's Validate Repo run's to start. Nothing was dispatched for ${sha}."
fi

failed_consumers=()
i=0
while [ "$i" -lt "$consumer_count" ]; do
  file="$(PLAN_FILE="$plan_file" I="$i" node -e '
    const p = JSON.parse(require("node:fs").readFileSync(process.env.PLAN_FILE, "utf8"));
    process.stdout.write(p.consumers[Number(process.env.I)].file);
  ')"
  inputs="$(PLAN_FILE="$plan_file" I="$i" node -e '
    const p = JSON.parse(require("node:fs").readFileSync(process.env.PLAN_FILE, "utf8"));
    process.stdout.write(JSON.stringify(p.consumers[Number(process.env.I)].inputs || {}));
  ')"
  echo "${LABEL}: requesting ${file} for ${sha} with inputs ${inputs}"
  if ! request_workflow_run_for_sha "$file" "$sha" "$inputs" "$token" "$repo" "$api" main "$LABEL"; then
    failed_consumers+=("$file")
  fi
  i=$((i + 1))
done

if [ "${#failed_consumers[@]}" -gt 0 ]; then
  fail "no run covering ${sha} could be confirmed for: ${failed_consumers[*]}. This commit is validated and its artifact is published, but the consumer(s) named here have not started; the pages it carries will not be submitted until they do."
fi

write_receipt "handed_off" "every consumer of Validate Repo has a run whose head_sha is ${sha}"
echo "${LABEL} ok: every consumer of Validate Repo has a run whose head_sha is ${sha}"
