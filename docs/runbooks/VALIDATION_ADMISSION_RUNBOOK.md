# Validation Admission Runbook

## Authority

`_validation_registry.json` is the only entry point for a new validator, test, lint rule, release stage, or CI workflow. `_repo_validation_matrix.json` contains only admitted or truthfully not-applicable execution records.

## Admission sequence

1. Add the proposed record to `_validation_registry.json` with status `PROPOSED`.
2. State the exact production or release risk prevented.
3. Explain why an existing admitted check cannot cover the risk.
4. Add deterministic known-good and known-bad fixtures.
5. Define evidence output, runtime budget, dependencies, and maintenance owner.
6. Run the candidate against both fixtures and confirm stable exit codes.
7. Assign the lowest truthful severity.
8. Change status to `ADMITTED`, `REJECTED`, or `NOT_APPLICABLE`.
9. For admitted or not-applicable checks, add one matching matrix entry in the same change.
10. Wire the package command, release router, or workflow only after registry and matrix admission.
11. Run `npm run validate:validation-registry`.

## Retirement

A retired check remains in the registry with status `RETIRED`, retirement date, reason, and replacement ID. Remove every package, CI, and runbook invocation before retirement is accepted. A replacement must preserve every unique assertion of the retired check.

## Prohibited shortcuts

- Do not add a validator directly to `package.json`.
- Do not add a CI gate without a workflow registry record.
- Do not downgrade severity to force a pass.
- Do not use a warning where a release-blocking defect is proven.
- Do not add a check without fixtures and an evidence contract.
