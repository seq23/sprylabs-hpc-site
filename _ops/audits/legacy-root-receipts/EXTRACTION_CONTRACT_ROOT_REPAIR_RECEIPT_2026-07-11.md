# Extraction Contract Root Repair Receipt — 2026-07-11

## Implemented
- Shared extraction contract library used by generation and validation.
- Type-aware final-state extraction validator across 2,279 admitted citation pages.
- HowTo repair normalizer that converts real ordered article steps into canonical Step headings.
- Exact regression fixtures for mislabeled Key Criteria blocks and missing in-block steps.
- Final-state validator added to the governed container-prepush profile.
- Citation repair pipeline now normalizes extraction contracts before release validation.

## Root failure repaired
`insights/guides/how-to-end-the-day-so-tomorrow-starts-fast.html` now contains five canonical Step headings inside its LLM extraction block.

## Validation
- Citation contract: PASS — 2,279 pages, 2,279 queries.
- Final extraction contract: PASS — 375 howto, 1,627 concept, 260 comparison, 16 decision, 1 transactional.
- Extraction fixture self-test (`validate:extraction-contract:self-test`): PASS — 5 fixtures.
- Two consecutive extraction-surface hash captures: IDENTICAL across 2,279 pages.
- Validation registry: PASS — zero unregistered and zero orphaned governed commands.
- Query-owner uniqueness: PASS — 2,279 active queries.
- Programmatic registry: PASS.
- Ownership: PASS — zero warnings.
- Safe Harbor: PASS — zero warnings.
- Release portability: PASS.

## Boundary
The monolithic full local updater remains the authoritative end-to-end validation and deployment boundary.
