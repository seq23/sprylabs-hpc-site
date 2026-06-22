# Workflow Data Trace — 2026-06-22

## Incident

The governed workflow failure was reproduced from the attached CI log. The hard failure was not the workflow YAML itself; it was a registry lineage break after a governed programmatic lane quarantined generated candidates and reran `build:postprocess`.

Failing hard gate:

- `npm run validate:programmatic-registry`

Observed failure class:

- `admission record has no active query owner`

Affected surface:

- A-player Phase 4 generated pages: `answers/phase4/**`, `use-cases/phase4/**`, `vs/phase4/**`, `glossary/phase4/**`, `methods/phase4/**`, `brand-defense/**`, `platforms/phase4/**`

## Root Cause

`python3 scripts/citation/apply_citation_program.py --postbuild` intentionally excludes the Phase 4 generated HTML paths from direct citation rewriting via `EXCLUDED_PREFIXES`, but its registry rebuild path did not preserve those excluded-prefix pages in `data/citation/citable_pages.json`, `data/citation/query_registry.json`, and `data/citation/framework_registry.json`.

That meant this sequence could break workflows:

1. `scripts/programmatic/run_lane.mjs` runs a governed workflow.
2. `run_lane` runs `npm run build:all`.
3. `build:all` regenerates and admits Phase 4 pages.
4. Candidate-only quality admission quarantines rejected candidates without failing the workflow.
5. Because rejected candidates exist, `run_lane` reruns `npm run build:postprocess`.
6. `apply_citation_program.py --postbuild` rebuilds citation registries while skipping Phase 4 HTML paths.
7. Phase 4 admission records remain, but their active query owners disappear.
8. `validate:programmatic-registry` fails.

## Patch

Updated `scripts/citation/apply_citation_program.py`:

- Added `preserve_excluded_prefix_registry_rows()`.
- During registry rebuild, it now preserves active citable rows for excluded-prefix pages if the physical HTML file still exists.
- Preserves generated `source` metadata so the Phase 4 expansion generator can cleanly replace those rows on the next build instead of accumulating stale query owners.
- Propagates preserved source metadata into rebuilt query and framework records.

Updated `scripts/validation/validate_programmatic_admission.py`:

- Under `--no-fail-quality`, quality rejections now print as `QUARANTINE` instead of `FAIL`.
- Hard validation failures still fail normally when `--no-fail-quality` is not present.

## Data Trace Proof

Focused trace executed against the patched baseline:

```json
{
  "admission_records": 2019,
  "active_query_records": 2019,
  "admission_missing_query_owner": 0,
  "stale_active_query_owner_without_admission": 0,
  "phase_expansion_records": 1400,
  "phase_expansion_missing_query_owner": 0,
  "generated_source_query_records": 1400
}
```

The same trace was checked after:

1. `python3 scripts/citation/apply_citation_program.py --postbuild`
2. `npm run validate:programmatic-registry`
3. `npm run build:aplayer-phase-expansion`
4. `npm run validate:programmatic-registry`
5. `npm run validate:citation-contract`

## Validation Executed In Container

Passed:

- Python syntax compile for patched scripts
- `python3 scripts/citation/apply_citation_program.py --postbuild`
- `npm run validate:programmatic-registry`
- `npm run build:aplayer-phase-expansion`
- `npm run validate:programmatic-registry` after regeneration
- `npm run validate:citation-contract`
- `npm run build:generated-content`
- `npm run build:postprocess`
- `npm run build:aplayer-phase-expansion`
- `npm run validate:content`
- `npm run validate:graph`
- `npm run validate:distribution`
- `npm run validate:ui-test-parity`
- `npm run validate:browser-suite-contract`
- `node scripts/validation/validate_release_atom_contract.mjs`
- `node scripts/validation/validate_release_mix_policy.mjs`
- `node scripts/validation/validate_citation_phase_manifest.mjs`
- `node scripts/validation/validate_no_keyword_swap_pages.mjs`
- `node scripts/validation/validate_claim_safety.mjs`
- `node scripts/validation/validate_internal_link_velocity.mjs`
- `node scripts/validation/validate_llms_full_coverage.mjs`
- `node scripts/validation/validate_sitemap_coverage.mjs`

Environment note:

- The container has Node `v22.16.0` while repo authority declares Node 24. Node 24 execution remains local/updater/GitHub authority. Container validation was used to prove the data trace and shared workflow gates, not to supersede the repo Node authority.

## Status

The workflow data lineage break is patched at the shared source: citation postbuild registry preservation. This should prevent all governed workflows that rerun `build:postprocess` after candidate quarantine from losing Phase 4 query ownership.
