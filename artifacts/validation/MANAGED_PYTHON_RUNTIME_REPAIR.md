# Managed Python Validation Runtime Repair

## Scope

This repair makes all governed Python validation and repair commands use a repository-managed virtual environment with pinned Beautiful Soup and lxml dependencies.

## Implemented

- `requirements-validation.txt` pins `beautifulsoup4==4.12.3` and `lxml==5.4.0`.
- `scripts/validation/python_runtime.mjs` bootstraps, probes, identifies, and executes the managed runtime.
- `scripts/validation/self_test_python_runtime.mjs` proves parser availability and runtime identity.
- Governed package scripts and sharded validators use the managed interpreter.
- Validation profiles bootstrap and preflight before mutating stages.
- Validation cache fingerprints include the dependency lock and runtime identity.
- `.validation-runtime/` and `.validation-cache/` are excluded from source packaging and portability scans.
- Runtime controls are admitted and classified in the registry and matrix.

## Targeted Validation

- Clean runtime bootstrap: PASS
- Managed lxml parser probe: PASS
- Exact failed extraction repair: PASS, 2,279 pages, 0 failures
- Validation cache fixtures: PASS, 8 fixtures
- Extraction fixtures: PASS, 13 fixtures
- Registry/control plane: PASS, 157 records and 156 matrix entries
- Release portability: PASS

## Boundary

The final local updater remains authoritative for complete integration validation, commit, push, and deployment.
