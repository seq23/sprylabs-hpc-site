#!/usr/bin/env bash
# Unpack the built tree over this job's checkout WITHOUT letting it overwrite
# .github.
#
# The tree is cached under build_input_hash.sh's key, which deliberately leaves
# .github/workflows out (no producer reads a workflow file). So on a cache hit
# the tar can come from an earlier commit whose workflow files differ from this
# one's - and a plain `tar -xf` over the checkout put them back. Recorded on
# PR #124, 2026-10-10: a workflow file deleted by the second commit reappeared
# in every shard from the first commit's cached tree, and
# validate:workflow-contract failed on a file the commit did not contain, while
# the edit that commit DID make to main-validation-sentinel.yml was silently
# replaced by the stale copy - validators were reading workflows nobody had
# committed. The checkout is the authority for .github; the tree only ever
# supplies what the producers build.
set -euo pipefail
TAR="${1:-${RUNNER_TEMP:-/tmp}/spry-build-tree.tar}"
if [ ! -s "$TAR" ]; then
  echo "[unpack-build-tree] FAIL: ${TAR} is missing or empty; the shards would validate the bare checkout" >&2
  exit 1
fi
tar --exclude=./.github -xf "$TAR"
entries="$(tar -tf "$TAR" | grep -vc '^\./\.github\(/\|$\)' || true)"
if [ "${entries:-0}" -lt 100 ]; then
  echo "[unpack-build-tree] FAIL: unpacked ${entries:-0} entries; the shards would validate an empty tree" >&2
  exit 1
fi
echo "[unpack-build-tree] OK: ${entries} entries unpacked; .github kept from the checkout"
