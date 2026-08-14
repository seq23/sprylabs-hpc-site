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

run_case() {
  local name="$1"
  local mode="$2"
  local expected_status="$3"
  local expected_replays="$4"
  local expected_pushes="$5"

  local case_dir="$tmp/$name"
  mkdir -p "$case_dir"
  : > "$case_dir/git-calls.log"
  : > "$case_dir/replay.log"
  printf '0' > "$case_dir/push-count"

  set +e
  PATH="$tmp/bin:$PATH" \
  GIT_CALL_LOG="$case_dir/git-calls.log" \
  PUSH_COUNT_FILE="$case_dir/push-count" \
  PUSH_MODE="$mode" \
  REPLAY_LOG="$case_dir/replay.log" \
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
}

run_case remote_advance remote_advance 0 1 2
run_case non_retryable non_retryable 128 0 1
run_case transient transient 0 0 2

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
writer_workflows=(
  ".github/workflows/spry-content-release.yml"
  ".github/workflows/search-intelligence.yml"
  ".github/workflows/daily-citation-intelligence.yml"
  ".github/workflows/admin-operations.yml"
  ".github/workflows/admin-command.yml"
  ".github/workflows/spry-full-rebuild.yml"
)
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
done

echo "commit_and_push_if_changed regression tests: PASS"
