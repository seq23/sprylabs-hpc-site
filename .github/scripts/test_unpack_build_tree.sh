#!/usr/bin/env bash
# A cached built tree from an earlier commit must not change .github in the
# checkout it is unpacked over (see unpack_build_tree.sh), and every place
# validate-repo.yml unpacks the tree must go through that helper.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$here/../.." && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
fail() { echo "[test:unpack-build-tree] FAIL: $*" >&2; exit 1; }

# The earlier commit's built tree: 120 built pages and a workflow since deleted.
mkdir -p "$work/old/.github/workflows" "$work/old/site"
for i in $(seq 1 120); do echo "page $i" > "$work/old/site/p$i.html"; done
echo "name: deleted since" > "$work/old/.github/workflows/stale.yml"
echo "name: old" > "$work/old/.github/workflows/kept.yml"
(cd "$work/old" && RUNNER_TEMP="$work" bash "$here/pack_build_tree.sh" >/dev/null)

# This commit's checkout: the stale workflow gone, kept.yml edited.
mkdir -p "$work/new/.github/workflows"
echo "name: new" > "$work/new/.github/workflows/kept.yml"
(cd "$work/new" && bash "$here/unpack_build_tree.sh" "$work/spry-build-tree.tar" >/dev/null)
[ ! -e "$work/new/.github/workflows/stale.yml" ] || fail "a workflow deleted by this commit was resurrected from the cached tree"
grep -qx "name: new" "$work/new/.github/workflows/kept.yml" || fail "this commit's workflow edit was overwritten by the cached tree"
[ "$(ls "$work/new/site" | wc -l | tr -d ' ')" -eq 120 ] || fail "the built tree's own files were not unpacked"

# Refuses a missing tree rather than validating the bare checkout.
if (cd "$work/new" && bash "$here/unpack_build_tree.sh" "$work/absent.tar" >/dev/null 2>&1); then fail "a missing tree unpacked as success"; fi

# Every unpack site in Validate Repo goes through the helper.
wf="$repo_root/.github/workflows/validate-repo.yml"
sites="$(grep -c 'run: bash .github/scripts/unpack_build_tree.sh' "$wf" || true)"
[ "${sites:-0}" -ge 1 ] || fail "validate-repo.yml unpacks the built tree nowhere through unpack_build_tree.sh; this check examined nothing"
raw="$(grep -nE 'tar[[:space:]]+-xf[[:space:]]+"\$RUNNER_TEMP/spry-build-tree\.tar"[[:space:]]*$' "$wf" || true)"
[ -z "$raw" ] || fail "validate-repo.yml unpacks the whole built tree with a raw tar: $raw"
echo "[test:unpack-build-tree] PASS: .github stays the checkout's; ${sites} unpack site(s) use the helper"
