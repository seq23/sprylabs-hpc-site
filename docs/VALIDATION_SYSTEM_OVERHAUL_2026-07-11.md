# Validation System Overhaul — 2026-07-11

## Purpose

Make release validation repair-first, prerequisite-aware, root-cause-oriented, and capable of ending with zero errors and zero warnings.

## Canonical lifecycle

1. Build generated surfaces.
2. Apply deterministic repairs.
3. Normalize every eligible agent run.
4. Validate root prerequisites before derivative coverage.
5. Run hard integrity and safety gates once.
6. Record editorial and external telemetry as information, not warnings.
7. Emit `release-clean-summary.json`.

## Severity policy

Hard failures are limited to corruption, missing provenance after repair, unsafe publication, false evidence, secret exposure, protected-lane mutation, invalid canonical/domain state, and broken required journeys.

Editorial targets, page-length targets, fanout coverage, observed external citation state, optional wrappers, and output-pattern expansion are informational unless the repo contract explicitly makes them release requirements.

## Root-cause suppression

A missing normalized agent payload produces one prerequisite failure after the repair phase. Downstream normalized-coverage, addressability, and page-proof comparisons do not run without that prerequisite.

## Self-healing

`release:repair-agent-normalization` validates and absorbs eligible agent runs before exact implementation and source-coverage validation. Absorbed manifests with missing normalized artifacts are eligible for reconstruction.

## Clean release contract

The release attestation writes:

- `artifacts/validation/release-clean-summary.json`
- `reports/release-clean-summary.json`

A passing release reports zero errors and zero warnings. Informational telemetry and genuine external decisions are counted separately.
