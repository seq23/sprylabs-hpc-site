#!/usr/bin/env bash
# Package the tree the producers just built so every validator shard sees exactly
# the same bytes. node_modules and .git are excluded because each shard installs
# from the npm cache and checks out for itself.
set -euo pipefail

# Written outside the workspace: validate:release-portability walks the repo
# root for oversized deployable assets, and this tar is ~292 MiB.
TAR="${RUNNER_TEMP:-/tmp}/spry-build-tree.tar"

tar --exclude=./node_modules \
    --exclude=./.git \
    -cf "$TAR" .

bytes="$(wc -c < "$TAR" | tr -d ' ')"
entries="$(tar -tf "$TAR" | wc -l | tr -d ' ')"
if [ "$entries" -lt 100 ]; then
  echo "[pack-build-tree] FAIL: packaged ${entries} entries; the shards would validate an empty tree" >&2
  exit 1
fi
echo "[pack-build-tree] OK: ${entries} entries, ${bytes} bytes"
