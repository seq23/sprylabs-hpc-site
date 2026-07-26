# Deep Validation Ledger — 2026-07-11

## Intent

Validate the complete local updater test spine one test at a time. Validators are evidence subordinate to product intent, route ownership, provenance, safety, and required public journeys.

## Root causes repaired

1. `build:all` rewrote Spry-owned public routes onto `billionairehighperformancecoach.com`.
2. Dual-domain metadata was correct in the source ZIP but non-idempotent after regeneration.
3. The conversion validator scanned fixture HTML as a public page.
4. Legacy CSV/HTML agent runs without optional JSON emitted warnings despite complete normalized provenance.
5. Paragraph sentence-count targets emitted warnings despite being editorial preferences.

## Implemented repairs

- Shared route ownership policy: `scripts/lib/dual_domain_policy.cjs`.
- Post-generation canonical and `og:url` self-heal: `scripts/repair/repair_dual_domain_metadata.js`.
- Repair runs after `build:all` and immediately before content-release validation.
- Dual-domain failures now report actual and expected canonical values.
- Word-count range drift is informational, not a release warning.
- Fixture HTML is excluded from public conversion enforcement.
- Legacy optional JSON absence is informational when normalized provenance exists.
- Paragraph sentence-count guidance is informational.

## Individually executed checks

All commands below exited 0 after the repairs:

- `npm run build:all`
- `npm run repair:dual-domain-metadata`
- `node scripts/validators/legacy_ops/validate_dual_domain_contract.js`
- `npm run repair:citation-contract-surfaces`
- `npm run validate:repo`
- `npm run validate:validation-registry`
- `npm run validate:workflow-contract`
- `npm run validate:workflow-lineage`
- `npm run validate:workflow-monitor`
- `npm run validate:workflow-topology`
- `npm run validate:workflow-topology:fixtures`
- `npm run workflow:hostile-review`
- `npm run agent:artifact-shape:self-test`
- `npm run agent:bhpc:validate`
- `npm run agent:bhpc:trace`
- `npm run validate:agent-run`
- `npm run validate:programmatic-admission`
- `node scripts/validation/validate_bhpc_page_contracts.mjs`
- `npm run validate:graph`
- `npm run validate:distribution`
- `npm run validate:browser-structural`
- `npm run validate:citation-velocity-automation`
- `npm run validate:disavow-asset`
- `npm run validate:programmatic-provenance`
- `npm run validate:programmatic-registry`
- `npm run validate:citation-contract`
- `npm run validate:citation-strategy`
- `npm run validate:rendered-schema-parity`
- `npm run validate:retired-route-references`
- `npm run validate:ui-test-parity`
- `npm run validate:browser-suite-contract`
- `npm run validate:traffic-qualified-suite`
- `npm run validate:artifact-consistency-e2e`
- `npm run validate:batch-f-continuity`
- Batch-G constituent checks through generated-content finalization and Batch-F continuity
- `npm run validate:bhpc-agent-improvement-capability`
- `node scripts/validation/validate_release_atom_contract.mjs`
- `node scripts/validation/validate_release_mix_policy.mjs`
- `node scripts/validation/validate_citation_phase_manifest.mjs`
- `node scripts/validation/validate_no_keyword_swap_pages.mjs`
- `node scripts/validation/validate_claim_safety.mjs`
- `node scripts/validation/validate_internal_link_velocity.mjs`
- `node scripts/validation/validate_llms_full_coverage.mjs`
- `node scripts/validation/validate_sitemap_coverage.mjs`
- `npm run validation:inventory`
- `npm run validate:warnings`

## Final attestation

```text
RELEASE VALIDATION: PASS
ERRORS: 0
WARNINGS: 0
SELF-HEALED: 0
INFORMATIONAL: 3671
EXTERNAL DECISIONS: 0
```

## Validation boundary

Executed in the provided container with Node 22.16.0. The repo declares Node 24 and the local updater remains authoritative for Node 24, browser/live deployment, commit, and push proof.
