#!/usr/bin/env bash
set -Eeuo pipefail

helper="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/commit_and_push_if_changed.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"

cat > "$tmp/bin/git" <<'GIT'
#!/usr/bin/env bash
set -u
printf '%s\n' "$*" >> "${GIT_CALL_LOG:?}"

case "${1:-}" in
  config|fetch|reset|clean|add|commit)
    exit 0
    ;;
  merge-base)
    exit 0
    ;;
  rev-parse)
    echo "0000000000000000000000000000000000000000"
    exit 0
    ;;
  diff)
    if [ "${2:-}" = "--cached" ] && [ "${3:-}" = "--quiet" ]; then
      exit 1
    fi
    exit 0
    ;;
  push)
    count=0
    if [ -f "${PUSH_COUNT_FILE:?}" ]; then count="$(cat "$PUSH_COUNT_FILE")"; fi
    count=$((count + 1))
    printf '%s' "$count" > "$PUSH_COUNT_FILE"
    case "${PUSH_MODE:?}" in
      remote_advance)
        if [ "$count" -eq 1 ]; then
          echo "! [rejected] HEAD -> main (fetch first)" >&2
          echo "error: failed to push some refs to 'origin'" >&2
          exit 1
        fi
        exit 0
        ;;
      non_retryable)
        echo "remote: Permission to seq23/sprylabs-hpc-site.git denied to github-actions[bot]." >&2
        echo "fatal: unable to access repository: The requested URL returned error: 403" >&2
        exit 128
        ;;
      transient)
        if [ "$count" -eq 1 ]; then
          echo "fatal: unable to access repository: Could not resolve host: github.com" >&2
          exit 128
        fi
        exit 0
        ;;
      *)
        echo "unknown PUSH_MODE=$PUSH_MODE" >&2
        exit 2
        ;;
    esac
    ;;
esac

exit 0
GIT
chmod +x "$tmp/bin/git"

# Stands in for the validation-dispatch request. Records that it was asked and
# with what, and returns whatever HTTP status the case under test wants.
cat > "$tmp/bin/curl" <<'CURL'
#!/usr/bin/env bash
set -u
printf '%s\n' "$*" >> "${DISPATCH_LOG:?}"
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then out="$arg"; fi
  prev="$arg"
done
if [ -n "$out" ]; then printf '{"message":"stub"}' > "$out"; fi
printf '%s' "${CURL_HTTP_CODE:-204}"
exit 0
CURL
chmod +x "$tmp/bin/curl"

run_case() {
  local name="$1"
  local mode="$2"
  local expected_status="$3"
  local expected_replays="$4"
  local expected_pushes="$5"
  local expected_dispatches="$6"

  local case_dir="$tmp/$name"
  mkdir -p "$case_dir"
  : > "$case_dir/git-calls.log"
  : > "$case_dir/replay.log"
  : > "$case_dir/dispatch.log"
  printf '0' > "$case_dir/push-count"

  set +e
  PATH="$tmp/bin:$PATH" \
  GIT_CALL_LOG="$case_dir/git-calls.log" \
  PUSH_COUNT_FILE="$case_dir/push-count" \
  PUSH_MODE="$mode" \
  REPLAY_LOG="$case_dir/replay.log" \
  DISPATCH_LOG="$case_dir/dispatch.log" \
  CURL_HTTP_CODE=204 \
  GITHUB_TOKEN=stub-token \
  GITHUB_REPOSITORY=seq23/sprylabs-hpc-site \
  WORKFLOW_ARGV='printf "replayed\\n" >> "$REPLAY_LOG"' \
  PUSH_RETRY_ATTEMPTS=3 \
  PUSH_RETRY_DELAY_SECONDS=0 \
  "$helper" "test commit" "test-workflow" >"$case_dir/stdout.log" 2>"$case_dir/stderr.log"
  status=$?
  set -e

  if [ "$status" -ne "$expected_status" ]; then
    echo "$name: expected status $expected_status, got $status" >&2
    cat "$case_dir/stderr.log" >&2
    exit 1
  fi

  replays="$(wc -l < "$case_dir/replay.log" | tr -d ' ')"
  pushes="$(cat "$case_dir/push-count")"
  if [ "$replays" -ne "$expected_replays" ]; then
    echo "$name: expected $expected_replays replay(s), got $replays" >&2
    exit 1
  fi
  if [ "$pushes" -ne "$expected_pushes" ]; then
    echo "$name: expected $expected_pushes push(es), got $pushes" >&2
    exit 1
  fi

  dispatches="$(grep -c 'actions/workflows/validate-repo.yml/dispatches' "$case_dir/dispatch.log" || true)"
  if [ "$dispatches" -ne "$expected_dispatches" ]; then
    echo "$name: expected $expected_dispatches validation dispatch(es), got $dispatches" >&2
    cat "$case_dir/stdout.log" >&2
    exit 1
  fi
}

# A push that lands but cannot request validation must fail the run. Returning
# zero here is the exact silence that let b3aec016c sit on a red main for hours.
run_dispatch_failure_case() {
  local name="$1"
  local case_dir="$tmp/$name"
  shift
  mkdir -p "$case_dir"
  : > "$case_dir/git-calls.log"
  : > "$case_dir/replay.log"
  : > "$case_dir/dispatch.log"
  printf '0' > "$case_dir/push-count"

  set +e
  env "$@" \
    PATH="$tmp/bin:$PATH" \
    GIT_CALL_LOG="$case_dir/git-calls.log" \
    PUSH_COUNT_FILE="$case_dir/push-count" \
    PUSH_MODE=transient \
    REPLAY_LOG="$case_dir/replay.log" \
    DISPATCH_LOG="$case_dir/dispatch.log" \
    WORKFLOW_ARGV='printf "replayed\n" >> "$REPLAY_LOG"' \
    PUSH_RETRY_ATTEMPTS=3 \
    PUSH_RETRY_DELAY_SECONDS=0 \
    "$helper" "test commit" "test-workflow" >"$case_dir/stdout.log" 2>"$case_dir/stderr.log"
  status=$?
  set -e

  if [ "$status" -eq 0 ]; then
    echo "$name: helper exited 0 after a push whose validation could not be requested" >&2
    exit 1
  fi
  if ! grep -q 'MAIN-VALIDATION-DISPATCH FAILED' "$case_dir/stderr.log"; then
    echo "$name: no named dispatch failure on stderr" >&2
    cat "$case_dir/stderr.log" >&2
    exit 1
  fi
}

run_missing_replay_case() {
  local case_dir="$tmp/missing_replay"
  mkdir -p "$case_dir"
  : > "$case_dir/git-calls.log"
  printf '0' > "$case_dir/push-count"

  set +e
  PATH="$tmp/bin:$PATH" \
  GIT_CALL_LOG="$case_dir/git-calls.log" \
  PUSH_COUNT_FILE="$case_dir/push-count" \
  PUSH_MODE=remote_advance \
  WORKFLOW_ARGV= \
  PUSH_RETRY_ATTEMPTS=3 \
  PUSH_RETRY_DELAY_SECONDS=0 \
  "$helper" "test commit" "test-workflow" >"$case_dir/stdout.log" 2>"$case_dir/stderr.log"
  status=$?
  set -e

  if [ "$status" -ne 2 ]; then
    echo "missing_replay: expected status 2, got $status" >&2
    cat "$case_dir/stderr.log" >&2
    exit 1
  fi
  if [ "$(cat "$case_dir/push-count")" -ne 1 ]; then
    echo "missing_replay: unsafe second push occurred" >&2
    exit 1
  fi
  if ! grep -q 'WORKFLOW_ARGV is required for safe replay' "$case_dir/stderr.log"; then
    echo "missing_replay: safe-failure message missing" >&2
    exit 1
  fi
}

run_case remote_advance remote_advance 0 1 2 1
run_case non_retryable non_retryable 128 0 1 0
run_case transient transient 0 0 2 1
run_missing_replay_case
run_dispatch_failure_case dispatch_http_error \
  CURL_HTTP_CODE=403 GITHUB_TOKEN=stub-token GITHUB_REPOSITORY=seq23/sprylabs-hpc-site
run_dispatch_failure_case dispatch_missing_token \
  CURL_HTTP_CODE=204 GITHUB_TOKEN= GH_TOKEN= GITHUB_REPOSITORY=seq23/sprylabs-hpc-site

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Derived, not hardcoded. The previous fixed list was a second copy of the writer
# inventory with no link to the workflows directory, so a new main-writing
# workflow would simply not appear in it and would inherit no coverage at all.
# Every workflow that can write contents is a candidate; the ones that actually
# reach main are the ones that invoke the shared helper.
writer_workflows=()
while IFS= read -r path; do
  [ -n "$path" ] || continue
  grep -q 'contents:[[:space:]]*write' "$path" || continue
  writer_workflows+=("${path#"$repo_root"/}")
done < <(find "$repo_root/.github/workflows" -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) | sort)

# Rule 0: a loop that examined nothing must not report success.
if [ "${#writer_workflows[@]}" -eq 0 ]; then
  echo "writer coordination: discovered zero contents:write workflows under .github/workflows; the guard examined nothing and cannot pass" >&2
  exit 1
fi
echo "writer coordination: examining ${#writer_workflows[@]} contents:write workflow(s)"

for workflow in "${writer_workflows[@]}"; do
  path="$repo_root/$workflow"
  if [ ! -f "$path" ]; then
    echo "writer coordination: missing $workflow" >&2
    exit 1
  fi
  if ! grep -Eq '^[[:space:]]*group:[[:space:]]*main-automation[[:space:]]*$' "$path"; then
    echo "writer coordination: $workflow is not serialized on main-automation" >&2
    exit 1
  fi
  if grep -Eq '(^|[;&|[:space:]])git[[:space:]]+push([[:space:]]|$)' "$path"; then
    echo "writer coordination: $workflow contains a raw git push" >&2
    exit 1
  fi
  if ! grep -q 'commit_and_push_if_changed.sh' "$path"; then
    echo "writer coordination: $workflow bypasses the shared push helper" >&2
    exit 1
  fi
  if ! grep -q 'WORKFLOW_ARGV' "$path"; then
    echo "writer coordination: $workflow does not declare an explicit replay command" >&2
    exit 1
  fi
  # The helper requests Validate Repo after it pushes, because a GITHUB_TOKEN
  # push raises no push event. That request needs the actions:write scope and a
  # token in the environment; without either, the writer lands on main and
  # nothing validates it.
  if ! grep -Eq '^[[:space:]]*actions:[[:space:]]*write[[:space:]]*$' "$path"; then
    echo "writer coordination: $workflow can push to main but lacks 'actions: write', so it cannot request validation of what it lands" >&2
    exit 1
  fi
  if ! grep -q 'GITHUB_TOKEN:' "$path"; then
    echo "writer coordination: $workflow does not pass GITHUB_TOKEN, so its validation dispatch would fail" >&2
    exit 1
  fi
done

# The helper itself must still make the request. Deleting the call would leave
# every check above passing while restoring the original hole.
if ! grep -q 'actions/workflows/validate-repo.yml/dispatches' "$repo_root/.github/scripts/commit_and_push_if_changed.sh"; then
  echo "writer coordination: the shared push helper no longer requests Validate Repo after pushing to main" >&2
  exit 1
fi

echo "commit_and_push_if_changed regression tests: PASS"
