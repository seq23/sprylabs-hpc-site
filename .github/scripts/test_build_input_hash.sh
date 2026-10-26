#!/usr/bin/env bash
# validate:build-input-hash-covers-tree
#
# The Validate Repo build is restored from cache under build_input_hash.sh's key,
# and unpack_build_tree.sh extracts that cached tree over the checkout (all of it
# except .github). So any tracked path outside .github that the key does not
# cover is a path a cache hit silently reverts to an older commit's bytes.
# PR #147, 25 Oct 2026: an artifacts/-only commit hit the cache, got the previous
# artifacts/ back, and failed a validator on bytes it never committed.
#
# Checks, against a scratch copy of the git index (the real index is untouched):
#   1. coverage: every tracked path outside .github/ is in the hashed listing;
#   2. an artifacts/-only change moves the key (the #147 case, by behaviour);
#   3. an ordinary content change moves the key;
#   4. a workflow-only change does NOT move the key (the reuse the cache is for).
# Fails on zero tracked files examined. Usage: test_build_input_hash.sh [script]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
SCRIPT="${1:-.github/scripts/build_input_hash.sh}"
TAG='[validate:build-input-hash-covers-tree]'
fail() { echo "$TAG FAIL: $*" >&2; exit 1; }

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
REAL_INDEX="$(git rev-parse --path-format=absolute --git-path index)"
cp "$REAL_INDEX" "$tmp/index"
export GIT_INDEX_FILE="$tmp/index"
unset GITHUB_OUTPUT

tracked="$(git ls-files | grep -Ev '^\.github/' | sort)"
n="$(printf '%s\n' "$tracked" | grep -c . || true)"
[ "${n:-0}" -ge 100 ] || fail "examined ${n:-0} tracked files; a near-empty tree proves nothing"

# 1. coverage
BUILD_INPUT_HASH_LIST=1 bash "$SCRIPT" | sort > "$tmp/hashed" || true
missing="$(comm -23 <(printf '%s\n' "$tracked") "$tmp/hashed" | grep -c . || true)"
if [ "${missing:-0}" -gt 0 ]; then
  comm -23 <(printf '%s\n' "$tracked") "$tmp/hashed" | head -5 | sed 's/^/  not in the key: /' >&2 || true
  fail "${missing} tracked path(s) the cached tree can overwrite are not in the build key"
fi

key() { bash "$SCRIPT" | sed -n 's/.*key=\([0-9a-f]*\).*/\1/p'; }
bump() { # replace $1's blob in the scratch index with different bytes
  local blob; blob="$(printf 'build-input-hash probe %s\n' "$1" | git hash-object -w --stdin)"
  git update-index --cacheinfo "100644,${blob},$1"
}
k0="$(key)"; [ -n "$k0" ] || fail "the script printed no key"

art="$(git ls-files artifacts | awk 'NR==1')"
[ -n "$art" ] || fail "no tracked file under artifacts/ to probe"
bump "$art"; k1="$(key)"
[ "$k1" != "$k0" ] || fail "changing only ${art} left the build key at ${k0}: a cache hit would restore the old artifacts/ over this commit (PR #147)"

cp "$REAL_INDEX" "$tmp/index"
page="$(printf '%s\n' "$tracked" | grep -E '\.html$' | awk 'NR==1')"
bump "$page"; k2="$(key)"
[ "$k2" != "$k0" ] || fail "changing ${page} left the build key unchanged"

cp "$REAL_INDEX" "$tmp/index"
wf="$(git ls-files .github/workflows | awk 'NR==1')"
[ -n "$wf" ] || fail "no tracked workflow to probe"
bump "$wf"; k3="$(key)"
[ "$k3" = "$k0" ] || fail "a workflow-only change moved the build key; validator-only edits would never reuse the cache"

echo "$TAG OK: ${n} tracked paths outside .github all in the key; artifacts/-only and page changes move it; workflow-only does not"
