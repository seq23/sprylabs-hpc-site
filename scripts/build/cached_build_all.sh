#!/usr/bin/env bash
# CACHED build:all — see docs/runbooks/BUILD_CACHE.md for the full design.
#
# WHY THIS EXISTS.
#
# validate-repo.yml already caches the WHOLE built tree for its own sharded
# job (PR #44, .github/scripts/build_input_hash.sh + pack_build_tree.sh +
# actions/cache), but that cache lives only inside that one workflow's "build"
# job. Every other path that runs `npm run build:all` — a developer or agent
# iterating locally, `npm run validate:all` run by hand, converge_tree_before_
# commit.sh's own loop (called by spry-content-release.yml and by every
# main-writing lane through commit_and_push_if_changed.sh), and
# workflow:spry-full-rebuild — pays the full ~2,231-page regeneration cost
# every single time, even when nothing that feeds the build has changed. That
# is the treadmill: main advances, a branch rebases, evidence has to be
# re-derived, and re-deriving means a full build:all again.
#
# Making `npm run build:all` ITSELF cache-aware fixes all of those call sites
# at once, with no change to any of them: the real script moved to
# build:all:uncached and this wraps it. Every caller keeps calling
# `npm run build:all` and gets the same output, faster when nothing moved.
#
# WHAT MAKES THIS SAFE.
#
# The key comes from .github/scripts/build_input_hash.sh unchanged — the same
# algorithm already proven in CI, not a new one. A cache entry is only ever
# written by save_build_cache.mjs, and only after the REAL, UNCACHED
# `npm run build:all` finished (exit 0) — a crashed or partial build is never
# saved, so there is no half-built entry to reject; there simply is no entry.
# build:all's own last steps are build_navigation_structure.mjs and
# build:visible-faq (see package.json), so "the real build finished" already
# means breadcrumbs, nav and FAQ ran — the exact ordering defect that produced
# FROZEN_OUTPUT_MATERIAL_SHRINK cannot recur here, because this cache never
# takes a snapshot mid-chain, only before the chain starts and after it exits.
#
# A restore never runs a generator; it writes back the exact bytes a prior
# real run produced from this exact starting tree (see restore_build_cache.mjs)
# and deletes anything that run removed. Any doubt — missing manifest, missing
# payload, a build that never reached exit 0 — falls through to a real,
# uncached build. Set BUILD_ALL_CACHE_DISABLE=1 to force that unconditionally.
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"

CACHE_ROOT="${BUILD_ALL_CACHE_ROOT:-.build-cache}"
mkdir -p "$CACHE_ROOT"

if [ "${BUILD_ALL_CACHE_DISABLE:-}" = "1" ]; then
  echo "[build-all-cache] BUILD_ALL_CACHE_DISABLE=1 — running the real, uncached build"
  exec npm run build:all:uncached
fi

hash_line="$(bash .github/scripts/build_input_hash.sh)"
echo "$hash_line"
key="$(printf '%s\n' "$hash_line" | sed -n 's/.*key=\([0-9a-f]\{1,\}\).*/\1/p' | tail -1)"

if [ -z "$key" ]; then
  echo "[build-all-cache] could not derive a key from build_input_hash.sh output — running the real build uncached" >&2
  exec npm run build:all:uncached
fi

entry="$CACHE_ROOT/$key"
manifest="$entry/manifest.json"

if [ -f "$manifest" ]; then
  if node scripts/build/restore_build_cache.mjs "$entry"; then
    echo "[build-all-cache] HIT key=$key — restored the tree a prior real build:all run produced from this exact input state; build:all skipped"
    exit 0
  fi
  echo "[build-all-cache] entry for key=$key exists but failed to restore cleanly — running the real build uncached" >&2
fi

echo "[build-all-cache] MISS key=$key — running the real build"
node scripts/build/snapshot_tree.mjs > "$CACHE_ROOT/.pre-$key.json"

set +e
npm run build:all:uncached
build_status=$?
set -e

if [ "$build_status" -ne 0 ]; then
  rm -f "$CACHE_ROOT/.pre-$key.json"
  echo "[build-all-cache] real build failed (exit $build_status) — nothing cached" >&2
  exit "$build_status"
fi

node scripts/build/save_build_cache.mjs "$key" "$CACHE_ROOT/.pre-$key.json" "$entry"
rm -f "$CACHE_ROOT/.pre-$key.json"
echo "[build-all-cache] saved cache entry key=$key"
