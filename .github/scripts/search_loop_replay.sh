#!/usr/bin/env bash
# Replay for the search loop after main moved: put this run's engine output
# (SEARCH_LOOP_PATCH, saved by search_loop_commit.sh) back onto the new main,
# then re-derive sitemaps and registries with the post-build. The engine's own
# files (questions/, data/search-loop/) keep this run's version on a conflict;
# any other conflicted file (derived ones the post-build rewrites) keeps main's.
set -Eeuo pipefail
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
    case "$f" in
      questions/*|data/search-loop/*) git checkout --theirs -- "$f" ;;
      *) git checkout --ours -- "$f" ;;
    esac
    echo "search-loop replay: resolved ${f}"
  done <<< "$conflicted"
fi
git reset -q
# No post-build (7 Nov 2026): the in-repo engine that re-derived sitemaps and
# heads is retired; files outside questions/ and data/search-loop/ keep main's
# version.
