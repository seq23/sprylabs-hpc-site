#!/usr/bin/env bash
# Package the tree the producers just built so every validator shard sees exactly
# the same bytes. node_modules and .git are excluded because each shard installs
# from the npm cache and checks out for itself.
set -euo pipefail

tar --exclude=./node_modules \
    --exclude=./.git \
    --exclude=./spry-build-tree.tar \
    -cf spry-build-tree.tar .

bytes="$(wc -c < spry-build-tree.tar | tr -d ' ')"
entries="$(tar -tf spry-build-tree.tar | wc -l | tr -d ' ')"
if [ "$entries" -lt 100 ]; then
  echo "[pack-build-tree] FAIL: packaged ${entries} entries; the shards would validate an empty tree" >&2
  exit 1
fi
echo "[pack-build-tree] OK: ${entries} entries, ${bytes} bytes"
