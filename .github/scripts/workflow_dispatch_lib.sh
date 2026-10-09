#!/usr/bin/env bash
# Sourced, never executed. The one implementation of "make a workflow run exist
# for this exact commit" that every GITHUB_TOKEN-driven hand-off in this repo
# goes through.
#
# WHY THIS IS A LIBRARY AND NOT A PARAGRAPH IN TWO SCRIPTS.
#
# A push made with GITHUB_TOKEN raises no push event, and a workflow run created
# by a GITHUB_TOKEN workflow_dispatch raises no workflow_run event. Both are the
# same recursion guard, and both leave the next stage of the pipeline with
# nothing to start it. commit_and_push_if_changed.sh learned the first half on
# 2026-08-31 (b3aec016c, main red for two hours with no run) and grew the
# request/confirm/re-request loop below to close it. The second half was found
# on 2026-09-18 and again on 2026-09-20: Spry Content Release pushed ad7beb69f,
# the helper dispatched Validate Repo (run 35544558796), it went green - and
# Deploy Distribution and Main Validation Sentinel, which are triggered by
# `workflow_run: workflows: ["Validate Repo"]`, never started. Every page the
# automation published was validated and never submitted anywhere. Nothing was
# red, because nothing ran.
#
# The fix for the second half is the same loop as the first, pointed at the
# consumers. Re-implementing it would have meant two copies of the race
# handling documented in commit_and_push_if_changed.sh, and the copy that was
# not tested would be the one that drifted. So the loop lives here, once, and
# both callers source it.
#
# REQUESTING IS NOT COVERING. workflow_dispatch resolves a BRANCH NAME to a SHA
# on GitHub's side, and that read can lag a push by seconds (recorded instance:
# f7572445d, 2026-09-14, dispatched five seconds after landing, run 34857679581
# pinned to its parent). So the unit of success is never the HTTP 204 on the
# POST; it is the existence of a run of the requested workflow whose head_sha IS
# the commit in question. request_workflow_run_for_sha establishes that
# predicate rather than hoping for it:
#
#   1. wait until the API's own view of the branch reports the SHA;
#   2. dispatch;
#   3. wait for a run whose head_sha is the SHA to exist;
#   4. if none appears, re-dispatch, bounded;
#   5. if none ever appears, return non-zero. A caller that turns that into a
#      zero restores the exact silence this exists to remove.
#
# Every knob is an environment variable with a default, so the regression tests
# can collapse the waits to zero and the workflows can leave them alone.

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

# Does a run of <workflow_file> exist whose head_sha is exactly this commit?
# Asked by exact-SHA query, which is an indexed lookup rather than a scan of a
# paginated branch listing - the same correction made in
# check_main_validation_coverage.mjs and for the same reason.
#
# Exit 0: yes. Exit 1: no. Exit 2: the read itself failed, which is not a "no".
workflow_run_exists_for_sha() {
  local workflow_file="$1" sha="$2" token="$3" repo="$4" api="$5"
  local json
  json="$(gh_api_get "/repos/${repo}/actions/runs?head_sha=${sha}&per_page=100" "$token" "$api")" || return 2
  printf '%s' "$json" | WORKFLOW_PATH=".github/workflows/${workflow_file}" node -e '
    let raw = "";
    process.stdin.on("data", (d) => (raw += d));
    process.stdin.on("end", () => {
      let parsed;
      try { parsed = JSON.parse(raw); } catch { process.exit(2); }
      const runs = Array.isArray(parsed.workflow_runs) ? parsed.workflow_runs : null;
      if (!runs) process.exit(2);
      const hit = runs.some((r) => r.path === process.env.WORKFLOW_PATH);
      process.exit(hit ? 0 : 1);
    });
  '
}

# Wait for GitHub to agree that <branch> is at <sha>. This is the step whose
# absence produced the 2026-09-14 miss. Returns 0 once it agrees, 1 if it never
# does within the bound; the caller decides what a 1 means.
wait_for_ref_to_carry_sha() {
  local sha="$1" token="$2" repo="$3" api="$4" branch="${5:-main}" label="${6:-DISPATCH}"
  local attempt=1 seen
  while [ "$attempt" -le "$REF_SETTLE_ATTEMPTS" ]; do
    # A failed read is an empty answer, not an exit: the callers run under
    # set -e and a transient 5xx here must fall through to the retry below.
    if ! seen="$(gh_api_get "/repos/${repo}/commits/${branch}" "$token" "$api" | node -e '
      let raw = "";
      process.stdin.on("data", (d) => (raw += d));
      process.stdin.on("end", () => {
        try { process.stdout.write(String(JSON.parse(raw).sha || "")); } catch { process.stdout.write(""); }
      });
    ')"; then
      seen=""
    fi
    if [ "$seen" = "$sha" ]; then
      echo "${label} ref settled: the API reports ${branch} at ${sha} after ${attempt} read(s)"
      return 0
    fi
    echo "${label} ref not settled yet (attempt ${attempt}/${REF_SETTLE_ATTEMPTS}): the API still reports ${branch} at '${seen:-<unreadable>}', not ${sha}"
    attempt=$((attempt + 1))
    [ "$attempt" -le "$REF_SETTLE_ATTEMPTS" ] && sleep "$REF_SETTLE_DELAY_SECONDS"
  done
  echo "${label} ref never settled on ${sha}" >&2
  return 1
}

# One POST to the dispatches endpoint. <inputs_json> is the JSON object for the
# "inputs" field, or "{}" for a workflow that declares none. 204 is the only
# accepted answer; anything else is printed with its body and returns 1.
post_workflow_dispatch() {
  local workflow_file="$1" branch="$2" inputs_json="$3" token="$4" repo="$5" api="$6" label="${7:-DISPATCH}"
  local body http_status payload
  payload="$(INPUTS_JSON="$inputs_json" BRANCH="$branch" node -e '
    const inputs = JSON.parse(process.env.INPUTS_JSON || "{}");
    const body = { ref: process.env.BRANCH };
    if (Object.keys(inputs).length) body.inputs = inputs;
    process.stdout.write(JSON.stringify(body));
  ')"
  body="$(mktemp)"
  http_status="$(curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${token}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${api}/repos/${repo}/actions/workflows/${workflow_file}/dispatches" \
    -d "$payload" || echo 000)"
  if [ "$http_status" = "204" ]; then
    rm -f "$body"
    return 0
  fi
  echo "${label} FAILED: HTTP ${http_status} requesting ${workflow_file} on ${branch}" >&2
  if [ -s "$body" ]; then cat "$body" >&2; fi
  rm -f "$body"
  return 1
}

# Make a run of <workflow_file> exist whose head_sha is <sha>. Idempotent: if
# one already exists this is one read and a return 0, which is what makes a
# replay path safe to send through here twice.
#
#   request_workflow_run_for_sha <workflow_file> <sha> <inputs_json> <token> <repo> <api> [branch] [label]
#
# Returns 0 only when such a run has been observed. Returns 1 when the request
# could not be made, or when DISPATCH_REQUEST_ATTEMPTS accepted dispatches each
# failed to produce one. Never returns 0 on an unconfirmed request.
request_workflow_run_for_sha() {
  local workflow_file="$1" sha="$2" inputs_json="$3" token="$4" repo="$5" api="$6"
  local branch="${7:-main}" label="${8:-DISPATCH}"

  if [ -z "$token" ] || [ -z "$repo" ]; then
    echo "${label} FAILED: a token and GITHUB_REPOSITORY are required to request ${workflow_file} for ${sha}. Add 'actions: write' permission and GITHUB_TOKEN to the calling workflow." >&2
    return 1
  fi

  if workflow_run_exists_for_sha "$workflow_file" "$sha" "$token" "$repo" "$api"; then
    echo "${label} ok: a ${workflow_file} run already covers ${sha}"
    return 0
  fi

  local request=1
  while [ "$request" -le "$DISPATCH_REQUEST_ATTEMPTS" ]; do
    if ! wait_for_ref_to_carry_sha "$sha" "$token" "$repo" "$api" "$branch" "$label"; then
      echo "${label}: dispatching anyway and confirming by head_sha below" >&2
    fi

    if ! post_workflow_dispatch "$workflow_file" "$branch" "$inputs_json" "$token" "$repo" "$api" "$label"; then
      return 1
    fi
    echo "${label} requested (attempt ${request}/${DISPATCH_REQUEST_ATTEMPTS}): ${workflow_file} on ${branch}, expecting head_sha ${sha}"

    local confirm=1
    while [ "$confirm" -le "$DISPATCH_CONFIRM_ATTEMPTS" ]; do
      if workflow_run_exists_for_sha "$workflow_file" "$sha" "$token" "$repo" "$api"; then
        echo "${label} ok: confirmed a ${workflow_file} run whose head_sha is ${sha}"
        return 0
      fi
      confirm=$((confirm + 1))
      [ "$confirm" -le "$DISPATCH_CONFIRM_ATTEMPTS" ] && sleep "$DISPATCH_CONFIRM_DELAY_SECONDS"
    done

    echo "${label} unconfirmed: the dispatch of ${workflow_file} was accepted but after ${DISPATCH_CONFIRM_ATTEMPTS} read(s) no run has head_sha ${sha}. This is the 2026-09-14 f7572445d shape - the dispatch resolved ${branch} to an older commit. Re-requesting." >&2
    request=$((request + 1))
  done

  echo "${label} FAILED: ${DISPATCH_REQUEST_ATTEMPTS} dispatch(es) of ${workflow_file} were accepted and none produced a run covering ${sha}." >&2
  return 1
}
