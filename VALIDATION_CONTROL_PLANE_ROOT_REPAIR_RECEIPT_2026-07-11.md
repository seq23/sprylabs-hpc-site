# Validation Control Plane Root Repair Receipt — 2026-07-11

## Root cause
A working validator could hard-block release solely because its package command had not yet been copied into the validator registry and matrix. The meta-validator treated administrative admission drift as equivalent to missing or unsafe executable protection.

## Implemented
- Split registry findings into hard errors, strong warnings, and warnings.
- Unregistered executable validators now emit `PASS_WITH_STRONG_WARNING` and exit 0.
- Admitted validators whose commands or implementations disappear remain hard failures.
- Added stable validator IDs for query-owner uniqueness and profile orchestration.
- Added profile orchestration under `_repo_validation_matrix.json`.
- Migrated container prepush from a handwritten command list to the `container-prepush` profile.
- Added validator discovery and candidate receipts.
- Added atomic validator registration tooling.
- Added a minimal control-plane bootstrap manifest.
- Added circularity regression tests for unregistered executables, missing admitted commands, unknown matrix IDs, and duplicate validator IDs.

## Preserved hard gates
Malformed control-plane JSON, duplicate IDs, command conflicts, missing admitted implementations, unknown matrix validators, retired active commands, and actual validator failures still block.

## Proof
- `npm run validation:control-plane:self-test`
- `npm run validate:validation-registry`
- `npm run validation:discover`
- `npm run validate:query-owner-uniqueness`
- `npm run validate:ownership`
- `npm run safe-harbor:validate`
