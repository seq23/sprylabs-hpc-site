#!/usr/bin/env bash
# Content hash of everything the producer steps read. Emitted as the build cache
# key, so a validator-only change restores the tree instead of rebuilding it and
# any change to content, scripts, data, configuration or the lockfile misses.
#
# `git ls-files -s` lists mode + blob sha + path for every tracked file, so the
# key is a true content hash of the checked-out commit, not a timestamp.
#
# Deliberately over-broad: it covers the whole tracked tree except the outputs
# and receipts the build itself writes, and except the workflow files, which no
# producer reads. A key that is too broad only costs a rebuild; a key that is too
# narrow ships a stale tree, which is a correctness bug.
set -euo pipefail

listing="$(git ls-files -s | grep -Ev '\s(artifacts|reports|logs|test-results|playwright-report|releases|\.build|\.github/workflows)/' | sort)"
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
