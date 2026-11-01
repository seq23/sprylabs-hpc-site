#!/usr/bin/env bash
# Search loop (seq23/search-loop), commit for this site: the shared commit
# helper (converge, pre-push validator, push with replay, then request Validate
# Repo for the pushed SHA). WORKFLOW_ARGV is the replay if main moved meanwhile.
set -Eeuo pipefail
# The helper requests Validate Repo for what it pushes; that needs a token.
: "${GITHUB_TOKEN:?GITHUB_TOKEN: is required so the shared helper can request Validate Repo for the pushed SHA}"
export WORKFLOW_ARGV="node .search-loop-engine/bin/search-loop.mjs run --config search-loop.config.json --stage build && bash .github/scripts/search_loop_post_build.sh"
./.github/scripts/commit_and_push_if_changed.sh "search loop: daily pages, checks and ledger" search-loop
