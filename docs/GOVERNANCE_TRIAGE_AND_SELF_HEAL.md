# Governance Triage and Self-Heal

## Purpose

Prevent harmless runtime or administrative findings from blocking valid releases while preserving real security, integrity, provenance, ownership, and required-output blockers.

## Existing control plane

This repo continues to use:

- `_validation_registry.json`
- `_repo_validation_matrix.json`
- `scripts/validation/validate_profile.mjs`
- existing discovery, admission, cache, parity, and orchestration tooling

No parallel registry, profile runner, cache service, or release-decision authority is introduced.

## Finding classes

- `SAFE_NOISE`: transient runtime or cache state that cannot affect source or deployable output
- `WARNING`: visible nonblocking governance drift
- `SELF_HEALABLE`: a deterministic allowlisted repair already exists
- `ITEM_SKIP`: one item can be safely excluded without blocking unrelated work
- `TRUE_BLOCKER`: material security, integrity, provenance, ownership, provider, or required-output failure
- `INTERNAL_ERROR`: validator or control-plane execution failure

## Blocking rule

A validator blocks only when at least one finding is `TRUE_BLOCKER` or `INTERNAL_ERROR`.

Warnings, safe noise, repaired findings, and safe item skips must remain visible and exit successfully.

## Repair boundary

`data/validation/governance_repair_map.json` may reference only existing deterministic repair commands. It is not an arbitrary mutation engine.

Automatic repair is forbidden for:

- secret exposure
- protected-lane mutation
- provenance loss
- canonical corruption
- unsafe provider mutation

Every repair must rerun the affected validator and may attempt once unless a narrower contract explicitly allows otherwise.

## Hostile review

`hostile_review.mjs` now records structured findings and treats transient runtime/cache paths as safe noise. Secret-shaped files outside transient paths remain hard blockers. Forbidden source/governance mutations, missing required outputs, failed workflows, failed canonical validation, provenance loss, and admission corruption remain hard blockers.

Run the focused classifier fixtures with:

`node scripts/workflow/hostile_review.mjs --self-test`

Run the blocker inventory with:

`node scripts/validation/governance_blocker_audit.mjs`

## Migration rule

Migrate validators only when evidence shows they overblock, misclassify warnings, or duplicate existing repair behavior. Do not rewrite all validators or create a second governance control plane.
