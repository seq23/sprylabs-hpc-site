#!/usr/bin/env bash
# Replay for the search loop after main moved: put this run's engine output
# (SEARCH_LOOP_PATCH, saved by search_loop_commit.sh) back onto the new main,
# then re-derive sitemaps and registries with the post-build. The engine's own
# files (SEARCH_LOOP_OWN_PATHS, default questions/ data/search-loop/) keep this
# run's version on a conflict; any other conflicted file (derived ones the
# post-build rewrites) keeps main's. SEARCH_LOOP_POST_BUILD names the site's
# post-build (default the BHPC one); search_loop_commit.sh sets both.
set -Eeuo pipefail
own_paths="${SEARCH_LOOP_OWN_PATHS:-questions/ data/search-loop/}"
post_build="${SEARCH_LOOP_POST_BUILD:-.github/scripts/search_loop_post_build.sh}"
owned() { local p; for p in $own_paths; do case "$1" in "$p"*) return 0 ;; esac; done; return 1; }
patch="${SEARCH_LOOP_PATCH:?SEARCH_LOOP_PATCH: the commit step must save the engine output before the replay}"
if [ ! -s "$patch" ]; then
  echo "NAMED STOP [SEARCH_LOOP_REPLAY_EMPTY] the saved engine output is empty; nothing to replay" >&2
  exit 1
fi
if ! git apply --3way --whitespace=nowarn "$patch"; then
  conflicted="$(git diff --name-only --diff-filter=U)"
  if [ -z "$conflicted" ]; then
    echo "NAMED STOP [SEARCH_LOOP_REPLAY_FAILED] the engine output does not apply to the new main and left no conflict to resolve" >&2
    exit 1
  fi
  while IFS= read -r f; do
    if owned "$f"; then git checkout --theirs -- "$f"; else git checkout --ours -- "$f"; fi
    echo "search-loop replay: resolved ${f}"
  done <<< "$conflicted"
fi
git reset -q
# Files outside the owned paths keep main's version; the post-build then
# re-derives the sitemaps and route table from the replayed pages, so a page
# replayed onto a moved main is still admitted.
bash "$post_build"
