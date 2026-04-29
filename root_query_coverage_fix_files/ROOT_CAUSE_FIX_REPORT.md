# Root Cause Fix Report — Query Coverage Workflow

## Failure
`npm run full:loop` failed inside `scripts/validators/validate_query_coverage.js` with:

`QUERY COVERAGE FAIL: 3 use_cases uncovered. See reports/query_coverage_gaps.json`

## Root cause
The backlog generator and the strict coverage validator were enforcing different contracts.

- `scripts/intake/build_backlog.js` selected the top scored clusters first and capped that ranked selection before proving canonical use-case coverage.
- `scripts/validators/validate_query_coverage.js` required every canonical use case present in `data/intake/query_clusters.json` to appear in `data/intake/build_backlog.json`.
- With 120 product-role/use-case clusters and 24 canonical use cases, a pure top-ranked selection could choose multiple clusters from the same use cases and skip others. That created uncovered canonical use cases even though the intake universe itself was healthy.

## Root fix
The generator now owns the same contract the validator enforces:

1. Select ranked high-score items first.
2. Add the best-scoring cluster for every missing canonical use case.
3. Fail inside backlog generation if any canonical use case remains uncovered.
4. Preserve comparison pages as required commercial fanout items.

## Validator hardening
`validate_query_coverage.js` now measures canonical use-case coverage directly and writes a more actionable `reports/query_coverage_gaps.json` with available clusters for any uncovered use case.

## Proof
Targeted commands run successfully after the fix:

- `node scripts/intake/build_backlog.js`
- `QUERY_COVERAGE_STRICT=1 node scripts/validators/validate_query_coverage.js`

Current result:

- Backlog items: 31
- Canonical use cases covered: 24/24
- Query coverage validator: PASS

## Files changed

- `scripts/intake/build_backlog.js`
- `scripts/validators/validate_query_coverage.js`
- `data/intake/build_backlog.json`
- `data/backlog/build_backlog.json`
- `reports/query_coverage_gaps.json`

## Note
The full workflow was not fully rerun in this container because several chained npm/bash commands timed out here even when their individual child scripts completed. The specific failing validator was reproduced at contract level and now passes after regenerating the backlog.
