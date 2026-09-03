# Build Cache

## Law

`npm run build:all` regenerates every page in the corpus (~2,231 pages) on
every invocation, and it is a step inside `npm run validate:all`
(`validate:profile container-prepush`), inside
`.github/scripts/converge_tree_before_commit.sh`'s loop, and inside
`workflow:spry-full-rebuild`. A no-op re-derivation — the tree is already at
the correct fixed point, nothing that feeds the build has changed — used to
cost the same as a cold build every time. This cache makes that case
near-instant without changing what any of those callers do.

This is a LOCAL, content-hash cache: `.build-cache/` at the repo root,
gitignored, safe to delete at any time (deleting it just means the next
build:all is a cache miss). It is complementary to, not a replacement for,
`validate-repo.yml`'s own `actions/cache`-backed tree cache (PR #44,
`.github/scripts/build_input_hash.sh` + `pack_build_tree.sh`) — that cache
covers only that one workflow's sharded "build" job; this one covers every
other caller, local and CI alike, by making the `npm run build:all` command
itself cache-aware.

## How it works

- `npm run build:all` → `bash scripts/build/cached_build_all.sh`
- `npm run build:all:uncached` → the original, unmodified script chain
  (`build:generated-content && build:postprocess && ... && build_navigation_structure.mjs
  && build:visible-faq && repair:health-boundary` — see
  `docs/runbooks/BUILD_GENERATOR_GRAPH.md` for the full chain and what is and
  is not proven about its internal dependencies)

On each `npm run build:all`:

1. `scripts/build/build_all_cache_key.mjs` computes a sha256 key from the
   CONTENT of every tracked-and-untracked-but-not-ignored file, excluding
   `.build-cache/`, `_validation_registry.json`, `_repo_validation_matrix.json`,
   and the same output/receipt directories `.github/scripts/build_input_hash.sh`
   already excludes in CI (`artifacts/`, `reports/`, `logs/`, `test-results/`,
   `playwright-report/`, `releases/`, `.build/`, `.github/workflows/`).
2. If `.build-cache/<key>/manifest.json` exists, `restore_build_cache.mjs`
   writes back the exact files a prior real build produced from this exact
   starting state and deletes anything that run removed. **No generator
   runs.** `build:all` exits.
3. Otherwise: `snapshot_tree.mjs` records the pre-build state,
   `build:all:uncached` runs for real, and — only if it exits 0 —
   `save_build_cache.mjs` diffs pre/post and stores the changed/added files
   (tar) and removed paths under `.build-cache/<key>/`.

`BUILD_ALL_CACHE_DISABLE=1 npm run build:all` bypasses the cache entirely,
both for debugging and as an escape hatch.

## Why the key is NOT `build_input_hash.sh`'s key

That script hashes `git ls-files -s` — the git INDEX, not the working tree.
Correct for a fresh CI checkout, where the two are always identical; wrong
for any caller with a possibly-dirty local tree. **Confirmed by
reproduction**: appending one line to a tracked page on disk without
`git add`ing it left `build_input_hash.sh`'s key unchanged. Wired in as-is,
that would have served the pre-edit cached tree on the next
`npm run build:all` — a false hit, which is the "incorrect-but-fast" outcome
the task that produced this cache explicitly forbids.
`scripts/build/build_all_cache_key.mjs` keeps the same exclude list but
hashes working-tree content, and also covers untracked-but-not-ignored files
(a brand new page or script that has not been `git add`ed yet).

## Why this cannot ship a half-built tree

The exact defect that broke this repo on 2026-09-01
(`FROZEN_OUTPUT_MATERIAL_SHRINK`, 1,448 pages, 5,059,469 bytes) was a byte
count taken from a tree `build_navigation_structure.mjs` and
`build:visible-faq` — the LAST two steps of `build:all:uncached` — had not
run yet. This cache can only ever snapshot the tree in exactly two moments:
**before** `build:all:uncached` starts, and **after** it exits 0. It never
looks at the tree mid-chain, so there is no way for a partially-built state
to be captured as a cache entry. A crashed or non-zero-exit run is never
saved at all — `save_build_cache.mjs` is only ever called after the exit
code is checked in `cached_build_all.sh`.

`scripts/validators/validate_build_cache_integrity.mjs` (VAL-BUILD-CACHE-
INTEGRITY, HARD_FAIL, in the `changed` and `container-prepush` profiles)
guards this structurally on every run — see its own header for the specific
regressions it hard-fails on, and the PR description for the negative-proof
reproduction (break each guard, watch it fail, restore, watch it pass).

## Proof this is byte-identical

Reproduced locally against the real `build:all:uncached` chain, not a
synthetic stand-in:

1. Cold build from a clean tree: 44.9s wall clock, 2,239 files changed, 1
   removed. Snapshot the resulting tree (`scripts/build/snapshot_tree.mjs`).
2. Reset the tree to the pre-build state (the build's own output is
   reproducible, so this is safe to discard — `git stash -u`, not `git
   clean`, so nothing untracked is silently lost).
3. `npm run build:all` again from the identical starting state: 1.5s, cache
   HIT, restored from `.build-cache/`.
4. Snapshot the result and diff it against step 1's snapshot, file by file,
   by content hash — not a sample.

Result: 0 files only in the cold-build snapshot, 0 files only in the
restored snapshot, 0 files with a differing hash, across all 6,981 files
walked. **Byte-identical.**

## What this does NOT do

Only the no-op case (nothing that feeds the build changed) is fast. A single
changed input — one edited page, one changed script, one changed data file —
moves the whole-tree key, so `npm run build:all` misses and pays the full
generation cost, same as a cold build (measured: 47.2s, vs. 44.9s cold — the
difference is noise). This is deliberate: `docs/runbooks/BUILD_GENERATOR_GRAPH.md`
establishes that at least two of `build:all`'s ten top-level steps
(`build_navigation_structure.mjs`, `build:visible-faq`) read and can rewrite
every page on disk regardless of which pages actually changed, and the
read/write behavior of the other ~25 scripts across steps 1–7 has not been
audited script-by-script. Without that audit, a per-page incremental rebuild
cannot be proven correct, and a wrong graph ships stale pages — worse than a
slow build. This cache stops at "cache the whole convergence result" on
purpose; incremental rebuilding is future work gated on that audit.

## Wall-clock, measured

| Case | Time | Notes |
|---|---|---|
| Cold build (clean tree, no cache entry) | 44.9s | 2,239 files changed, 1 removed |
| No-op (identical starting tree, cache hit) | 1.5s | restore only, 0 generators run, byte-identical to cold |
| One page changed (new input state, cache miss) | 47.2s | full regeneration, same cost as cold — expected, see above |

These are `npm run build:all` alone, not the full `npm run validate:all`
(131 steps) or the multi-pass `converge_tree_before_commit.sh` loop — both of
which call `npm run build:all` one or more times and inherit this speedup on
every no-op call for free, with zero changes to either.
