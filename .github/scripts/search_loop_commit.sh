#!/usr/bin/env bash
# Search loop (seq23/search-loop), commit for this site: the shared commit
# helper (converge, pre-push validator, push with replay, then request Validate
# Repo for the pushed SHA). WORKFLOW_ARGV is the replay if main moved meanwhile.
#
# The replay re-applies THIS run's engine output (saved below as a patch) onto
# the new main and re-runs the post-build, instead of re-running the engine.
# Re-running the engine took 40-50 min on the free model lanes, so main always
# moved again before it finished (run 41316761737 cancelled after 88 min), and
# the earlier build-only replay ran after `git clean` had removed the run's
# targets.json, ending NO_TARGETS (run 41313341863). The pages never landed.
set -Eeuo pipefail
# The helper requests Validate Repo for what it pushes; that needs a token.
: "${GITHUB_TOKEN:?GITHUB_TOKEN: is required so the shared helper can request Validate Repo for the pushed SHA}"
patch_dir="$(mktemp -d)"
export SEARCH_LOOP_PATCH="${patch_dir}/engine-output.patch"
git add -A -N -- .
git diff --binary --full-index HEAD -- . > "$SEARCH_LOOP_PATCH"
git reset -q
export WORKFLOW_ARGV="bash .github/scripts/search_loop_replay.sh"
./.github/scripts/commit_and_push_if_changed.sh "search loop: daily pages, checks and ledger" search-loop
