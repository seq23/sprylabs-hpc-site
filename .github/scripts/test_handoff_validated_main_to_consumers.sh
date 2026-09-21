#!/usr/bin/env bash
set -Eeuo pipefail

# Exercises handoff_validated_main_to_consumers.sh against a stubbed GitHub API,
# the same way test_commit_and_push_if_changed.sh exercises the push helper. The
# cases are the ones that matter for the defect it closes:
#
#   dispatch_main        a Validate Repo run started by workflow_dispatch on main
#                        must dispatch EVERY workflow_run consumer with the inputs
#                        it declares, and confirm a run exists for the SHA.
#   push_main            a push-started run must NOT dispatch (the platform
#                        raises workflow_run for it) and must say so by name.
#   human_dispatch       a workflow_dispatch made by a person must NOT dispatch
#                        either (Validate Repo 34714645220 by seq23 chained
#                        Deploy Distribution 34715301733 on its own; only a
#                        GITHUB_TOKEN dispatch is silenced) and must say so.
#   not_main             a non-main ref must not dispatch and must say so by name.
#   never_covers         accepted dispatches that never produce a run are a
#                        failure, not a clean exit - the f7572445d shape again.
#   main_moved           main no longer at the validated SHA: nothing dispatched,
#                        non-zero, named.
#   zero_consumers       a workflows directory with no consumer must fail; a
#                        hand-off to nothing must not report success.
#   already_covered      consumers that already have a run for the SHA are not
#                        dispatched again (the idempotence a replay relies on).

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
handoff="$script_dir/handoff_validated_main_to_consumers.sh"
# The consumer module needs PyYAML, which the managed runtime pins
# (requirements-validation.txt); the system python3 may or may not have it. The
# runtime resolves its venv against the current directory, so run from the root.
cd "$repo_root"
python_runtime="${HANDOFF_PYTHON_RUNTIME:-node scripts/validation/python_runtime.mjs run}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"

cat > "$tmp/bin/curl" <<'CURL'
#!/usr/bin/env bash
set -u
args="$*"
printf '%s\n' "$args" >> "${DISPATCH_LOG:?}"
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then out="$arg"; fi
  if [ "$prev" = "-d" ]; then printf '%s\n' "$arg" >> "${DISPATCH_BODY_LOG:?}"; fi
  prev="$arg"
done
emit() {
  if [ -n "$out" ]; then printf '%s' "$1" > "$out"; fi
  printf '%s' "$2"
  exit 0
}
case "$args" in
  *"/dispatches"*)
    wf="$(printf '%s' "$args" | sed -E 's#.*/actions/workflows/([^/]+)/dispatches.*#\1#')"
    case "${STUB_DISPATCH_EFFECT:-covers}" in
      covers) printf '%s\n' "$wf" >> "${RUN_STATE_FILE:?}" ;;
      misses) : ;;
    esac
    emit '{"message":"stub"}' 204
    ;;
  *"/commits/main"*)
    emit "{\"sha\":\"${STUB_REF_SHA:?}\"}" 200
    ;;
  *"/actions/runs?head_sha="*)
    runs=""
    if [ -f "${RUN_STATE_FILE:?}" ]; then
      while IFS= read -r wf; do
        [ -n "$wf" ] || continue
        runs="${runs:+$runs,}{\"id\":1,\"path\":\".github/workflows/${wf}\",\"conclusion\":null}"
      done < "$RUN_STATE_FILE"
    fi
    emit "{\"total_count\":0,\"workflow_runs\":[${runs}]}" 200
    ;;
esac
emit '{"message":"stub"}' 500
CURL
chmod +x "$tmp/bin/curl"

sha="1111111111111111111111111111111111111111"

run_case() {
  local name="$1" event="$2" ref="$3" ref_sha="$4" effect="$5" expected_status="$6" expected_dispatches="$7"
  shift 7
  local actor="${CASE_ACTOR:-github-actions[bot]}"
  local case_dir="$tmp/$name"
  mkdir -p "$case_dir"
  : > "$case_dir/dispatch.log"
  : > "$case_dir/dispatch-bodies.log"
  # Pre-seeded by the already_covered case; every other case starts empty.
  [ -f "$case_dir/run-state" ] || : > "$case_dir/run-state"
  local workflows_dir="${CASE_WORKFLOWS_DIR:-$repo_root/.github/workflows}"

  local status=0
  env "$@" \
    PATH="$tmp/bin:$PATH" \
    DISPATCH_LOG="$case_dir/dispatch.log" \
    DISPATCH_BODY_LOG="$case_dir/dispatch-bodies.log" \
    RUN_STATE_FILE="$case_dir/run-state" \
    STUB_DISPATCH_EFFECT="$effect" \
    STUB_REF_SHA="$ref_sha" \
    REF_SETTLE_DELAY_SECONDS=0 \
    DISPATCH_CONFIRM_DELAY_SECONDS=0 \
    DISPATCH_CONFIRM_ATTEMPTS=2 \
    DISPATCH_REQUEST_ATTEMPTS=2 \
    GITHUB_TOKEN=stub-token \
    GITHUB_REPOSITORY=seq23/sprylabs-hpc-site \
    GITHUB_SHA="$sha" \
    GITHUB_RUN_ID=424242 \
    GITHUB_EVENT_NAME="$event" \
    GITHUB_ACTOR="$actor" \
    GITHUB_REF="$ref" \
    HANDOFF_WORKFLOWS_DIR="$workflows_dir" \
    HANDOFF_PLAN_FILE="$case_dir/plan.json" \
    HANDOFF_RECEIPT_FILE="$case_dir/receipt.json" \
    HANDOFF_PYTHON_RUNTIME="$python_runtime" \
    bash "$handoff" >"$case_dir/stdout.log" 2>"$case_dir/stderr.log" || status=$?

  if [ "$status" -ne "$expected_status" ]; then
    echo "$name: expected status $expected_status, got $status" >&2
    cat "$case_dir/stdout.log" "$case_dir/stderr.log" >&2
    exit 1
  fi
  local dispatches
  dispatches="$(awk '/\/dispatches/ { n++ } END { print n + 0 }' "$case_dir/dispatch.log")"
  if [ "$dispatches" -ne "$expected_dispatches" ]; then
    echo "$name: expected $expected_dispatches dispatch(es), got $dispatches" >&2
    cat "$case_dir/stdout.log" "$case_dir/stderr.log" "$case_dir/dispatch.log" >&2
    exit 1
  fi
  if [ ! -s "$case_dir/receipt.json" ]; then
    echo "$name: no receipt was written; an outcome that dies with the log cannot be audited" >&2
    exit 1
  fi
}

# The consumers the real workflow files declare, derived the same way the script
# derives them, so this test cannot drift from the tree it tests.
#
# Read through --out, not stdout: the managed python runtime prints its venv
# bootstrap (pip's "Collecting ...") to stdout on a first run, which is exactly
# what a fresh CI runner is, and a JSON.parse of that is a test that fails for a
# reason that is not real. The hand-off script itself reads its plan the same way.
$python_runtime "$repo_root/scripts/workflow/validate_repo_consumers.py" plan \
  --workflows-dir "$repo_root/.github/workflows" --sha "$sha" --run-id 424242 \
  --out "$tmp/tree-plan.json" >/dev/null
consumer_files="$(PLAN_FILE="$tmp/tree-plan.json" node -e 'const p=JSON.parse(require("node:fs").readFileSync(process.env.PLAN_FILE,"utf8"));process.stdout.write(p.consumers.map(c=>c.file).join("\n"))')"
consumer_count="$(printf '%s\n' "$consumer_files" | awk 'NF { n++ } END { print n + 0 }')"
if [ "$consumer_count" -lt 2 ]; then
  echo "handoff test: expected at least two workflow_run consumers of Validate Repo (Deploy Distribution, Main Validation Sentinel), derived $consumer_count" >&2
  exit 1
fi

run_case dispatch_main workflow_dispatch refs/heads/main "$sha" covers 0 "$consumer_count"
for wf in $consumer_files; do
  if ! grep -q "actions/workflows/${wf}/dispatches" "$tmp/dispatch_main/dispatch.log"; then
    echo "dispatch_main: consumer $wf was never dispatched" >&2
    cat "$tmp/dispatch_main/dispatch.log" >&2
    exit 1
  fi
done
# Deploy Distribution must receive the artifact identity, not just a ref.
if ! grep -q "\"artifact_name\":\"spry-validated-${sha}\"" "$tmp/dispatch_main/dispatch-bodies.log"; then
  echo "dispatch_main: no dispatch body carried artifact_name=spry-validated-${sha}" >&2
  cat "$tmp/dispatch_main/dispatch-bodies.log" >&2
  exit 1
fi
if ! grep -q '"artifact_run_id":"424242"' "$tmp/dispatch_main/dispatch-bodies.log"; then
  echo "dispatch_main: no dispatch body carried artifact_run_id" >&2
  exit 1
fi
if ! grep -q '"outcome": "handed_off"' "$tmp/dispatch_main/receipt.json"; then
  echo "dispatch_main: receipt does not record handed_off" >&2
  cat "$tmp/dispatch_main/receipt.json" >&2
  exit 1
fi

run_case push_main push refs/heads/main "$sha" covers 0 0
grep -q 'NAMED STOP' "$tmp/push_main/stdout.log" || { echo "push_main: a push-started run stopped without naming why" >&2; exit 1; }

CASE_ACTOR=seq23 run_case human_dispatch workflow_dispatch refs/heads/main "$sha" covers 0 0
grep -q 'NAMED STOP' "$tmp/human_dispatch/stdout.log" || { echo "human_dispatch: a person's dispatch stopped without naming why" >&2; exit 1; }
grep -q "dispatched by 'seq23'" "$tmp/human_dispatch/stdout.log" || { echo "human_dispatch: the stop did not name the actor" >&2; exit 1; }

run_case not_main workflow_dispatch refs/heads/feature "$sha" covers 0 0
grep -q 'NAMED STOP' "$tmp/not_main/stdout.log" || { echo "not_main: a non-main run stopped without naming why" >&2; exit 1; }

run_case never_covers workflow_dispatch refs/heads/main "$sha" misses 1 $((consumer_count * 2))
grep -q 'VALIDATED-MAIN-HANDOFF FAILED' "$tmp/never_covers/stderr.log" || { echo "never_covers: no named failure on stderr" >&2; exit 1; }

run_case main_moved workflow_dispatch refs/heads/main 2222222222222222222222222222222222222222 covers 1 0
grep -q 'main is no longer at' "$tmp/main_moved/stderr.log" || { echo "main_moved: did not name the moved ref" >&2; exit 1; }

# A tree with a producer but no consumer. Rule 0: a hand-off to nothing fails.
mkdir -p "$tmp/no-consumers"
cp "$repo_root/.github/workflows/validate-repo.yml" "$tmp/no-consumers/"
CASE_WORKFLOWS_DIR="$tmp/no-consumers" run_case zero_consumers workflow_dispatch refs/heads/main "$sha" covers 1 0
grep -q 'VALIDATED-MAIN-HANDOFF FAILED' "$tmp/zero_consumers/stderr.log" || { echo "zero_consumers: no named failure" >&2; exit 1; }

# Consumers already have a run for this SHA: one read each, no dispatch.
mkdir -p "$tmp/already_covered"
printf '%s\n' "$consumer_files" > "$tmp/already_covered/run-state"
run_case already_covered workflow_dispatch refs/heads/main "$sha" covers 0 0
grep -q 'already covers' "$tmp/already_covered/stdout.log" || { echo "already_covered: did not report existing coverage" >&2; exit 1; }

echo "handoff_validated_main_to_consumers regression tests: PASS (${consumer_count} consumer(s) derived from the tree)"
