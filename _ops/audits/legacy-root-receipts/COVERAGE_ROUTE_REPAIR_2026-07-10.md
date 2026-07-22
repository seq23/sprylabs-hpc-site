# Coverage Route Repair — 2026-07-10

## Purpose

Keep `/coverage/` as the public knowledge-map route while preventing packaging loss and operational-data leakage.

## Changes

- Removed the baseline packager exclusion that incorrectly treated `coverage/` as test output.
- Added `coverage/index.html` and `coverage/coverage.json` to required baseline files.
- Public coverage now reports published clusters/pages only.
- Draft counts, release dates, and runway moved to `data/admin/coverage_operations.json` and `/admin`.
- Added `validate:coverage-route` with admitted positive/negative fixtures.
- Directory routes remain resolved through their normal `index.html` contract.

## Validation posture

Hard fail only when the route is publicly linked but absent, packaging removes it, canonicals are invalid, or private runway data leaks publicly. Counts, descriptions, and optional presentation details are not hard gates.
