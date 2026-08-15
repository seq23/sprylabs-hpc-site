# SpryLabs Agent Intake Reliability Repair — 2026-08-15

## Repository identity

- Repository: `seq23/sprylabs-hpc-site`
- Source of truth: uploaded full baseline ZIP `sprylabs-hpc-site-main(7).zip`
- Source ZIP SHA256: `370c9860ba3355b107a920caec553a8f6dec25129eac49d484d4df2024d3d8df`
- Runtime model: `FULL_SAFE_AUTONOMY`

## Failure repaired

The 2026-08-15 agent intake supplied source evidence for the Ali Abdaal query in the matching result record, but the page-opportunity parser evaluated only the isolated `new_page_opportunities` object. That incorrectly marked the route blocked. A second acceptance row for the same query still scheduled and rendered the route, producing a contradictory REQUIRED/BLOCKED state and causing both the content-release and CI-validation Actions to fail with `blocked_route_rendered`.

## Implemented in this snapshot

1. Matching page opportunities inherit source/evidence URLs from query-result records in the same intake artifact.
2. Page-spec blocking now evaluates direct plus inherited evidence.
3. Matching record rows inherit the page-spec operation/block state instead of forcing `CREATE_NEW_TARGET_PAGE`.
4. Acceptance compilation reconciles same-run/same-scope/same-route conflicts using most-restrictive-wins.
5. Exact planning independently prevents any blocked route from being scheduled.
6. Route-resolution regression coverage tests evidence-backed admission, unsupported blocking, and duplicate route conflicts.
7. The full 2026-08-15 intake was materialized: 2 existing-page repairs and 8 new pages, with 0 blocked active specs.

## Current intake materialization

- Existing-page repairs: 2
- New pages created: 8
- Active blocked specs: 0
- Apply result: 10 applied, 0 skipped
- Trace: 839 acceptance entries, 10 active specs

## Validation performed here

- JavaScript syntax checks for changed intake/control-plane modules.
- Existing BHPC route-resolution self-test, extended with the new regression cases: PASS.
- Agent absorption/acceptance compilation/exact planning completed for the 2026-08-15 artifact.
- Structural presence check confirmed all 10 planned routes exist under `site/public/` and contain every planned acceptance marker.
- Exact implementation trace completed successfully.

## Validation not claimed

Full local updater validation, complete release-profile validation, GitHub push, exact-SHA GitHub Actions, deployment, and production behavior were not run from this artifact build. Those remain local/updater responsibilities.

## Status

STRUCTURALLY CHECKED — LOCAL VALIDATION REQUIRED
