# Orchestration Migration Repair — 2026-07-11

## Source baseline

`sprylabs-hpc-site-main_BASELINE_07-11-26_de94e49bea20.zip`

## Failure repaired

The citation-velocity validator inspected the literal `validate:all` package-script body and rejected the canonical matrix/profile delegation even though the validator was reachable and executed.

## Implemented

- Canonical package-script/profile execution graph resolver.
- Reachability validation for public validation aliases and mandatory validators.
- Cycle, missing command, missing profile, and dead-alias detection.
- Complete audit for stale literal `validate:all` assertions.
- Citation-velocity validation migrated from string matching to graph reachability.
- Hostile fixture suite covering direct, profile, nested, missing, cyclic, duplicate-path, and false-edge cases.
- Explicit registry/matrix admission for the orchestration gate, fixture suite, and previously unadmitted direct container-prepush steps.
- Orchestration gate placed before mutation in `container-prepush` and `changed` profiles.

## Proof

- Orchestration graph: 269 nodes, 267 edges, 5 public aliases.
- Cycles: 0.
- Legacy literal assertions: 0.
- Hostile fixtures: 10/10 PASS.
- Citation velocity automation: PASS.
- Validation registry: 166 records, 165 matrix entries, PASS.
- Clean managed runtime bootstrap: PASS.
- Complete `container-prepush`: terminal PASS, exit code 0.

## Scope boundary

No public content, visual design, citation logic, extraction rules, schema rules, or deployment provider was intentionally changed by this repair. Generated mutations from the proof run were not copied into the packaged baseline.
