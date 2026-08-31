#!/usr/bin/env bash
# Make the build cache auditable. A cache that silently never hits wastes a job
# slot on every run and looks healthy forever, so the outcome is printed on every
# run and a claimed hit is checked against the tar actually being on disk.
set -euo pipefail

TAR="${RUNNER_TEMP:-/tmp}/spry-build-tree.tar"
hit="${1:-}"
key="${2:-}"

if [ -z "$key" ]; then
  echo "[build-cache] FAIL: no cache key was computed; the cache could never hit" >&2
  exit 1
fi

if [ "$hit" = "true" ]; then
  if [ ! -s "$TAR" ]; then
    echo "[build-cache] FAIL: cache reported a hit for ${key} but ${TAR} is missing or empty" >&2
    exit 1
  fi
  echo "[build-cache] HIT key=${key} bytes=$(wc -c < "$TAR" | tr -d ' ') - producers skipped"
else
  if [ -s "$TAR" ]; then
    echo "[build-cache] FAIL: cache reported a miss for ${key} but a tree tar is already present at ${TAR}" >&2
    exit 1
  fi
  echo "[build-cache] MISS key=${key} - producers will run and populate the cache"
fi

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "build cache: ${hit:-false} (key ${key})" >> "$GITHUB_STEP_SUMMARY"
fi
