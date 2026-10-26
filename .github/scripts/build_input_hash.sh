#!/usr/bin/env bash
# Content hash of everything the producer steps read. Emitted as the build cache
# key, so a validator-only change restores the tree instead of rebuilding it and
# any change to content, scripts, data, configuration or the lockfile misses.
#
# `git ls-files -s` lists mode + blob sha + path for every tracked file, so the
# key is a true content hash of the checked-out commit, not a timestamp.
#
# Deliberately over-broad: it covers EVERY tracked file the cached tree can put
# back over a checkout. unpack_build_tree.sh extracts the whole tar except
# .github, so every tracked path outside .github is in the key; only the workflow
# files are left out (no producer reads them, and unpack never restores them).
# A key that is too broad only costs a rebuild; a key that is too narrow ships a
# stale tree, which is a correctness bug.
#
# It used to leave out artifacts/, reports/, logs/, test-results/,
# playwright-report/, releases/ and .build/ as "outputs the build writes". But
# committed files live there too - validators read artifacts/ as committed
# input. PR #147, 25 Oct 2026: commit 283765cc1 changed only
# artifacts/validation/python-dependency-contract.json, the key did not move, the
# build was a cache HIT, the tar put the PREVIOUS commit's copy back over the
# checkout, and validate:python-dependency-contract failed on bytes the commit
# did not contain. Guarded by validate:build-input-hash-covers-tree
# (.github/scripts/test_build_input_hash.sh).
#
# BUILD_INPUT_HASH_LIST=1 prints the hashed paths instead, so the guard can
# prove coverage against `git ls-files` rather than trust this comment.
set -euo pipefail

listing="$(git ls-files -s | grep -Ev '\s\.github/workflows/' | sort)"
if [ "${BUILD_INPUT_HASH_LIST:-}" = "1" ]; then
  printf '%s\n' "$listing" | cut -f2-
  exit 0
fi
count="$(printf '%s\n' "$listing" | grep -c . || true)"

if [ "${count:-0}" -lt 100 ]; then
  echo "[build-input-hash] FAIL: hashed ${count:-0} files; a near-empty listing would make the key constant and every run would falsely hit" >&2
  exit 1
fi

key="$(printf '%s\n' "$listing" | sha256sum | cut -c1-40)"
if [ -z "$key" ]; then
  echo "[build-input-hash] FAIL: could not compute a key" >&2
  exit 1
fi

echo "[build-input-hash] files=${count} key=${key}"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "key=${key}" >> "$GITHUB_OUTPUT"
fi
