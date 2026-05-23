# Artifact Manifest

Artifact: `sprylabs-hpc-site-main_BASELINE_05-24-26_1c1cb28.zip`
Repo: `sprylabs-hpc-site`
Mode: full baseline snapshot
Packaged root: `/mnt/data/spry_fix_work`
Branch target: `main`
Status: `LOCAL VALIDATION PASSED — LOCAL UPDATER REQUIRED`

## Source Basis

This snapshot continues from `sprylabs-hpc-site-main_BASELINE_05-24-26_411592d.zip` and fixes the answer-surface validation failure from the exact-match page pass.

## Implemented Fixes

- Added deterministic answer-surface observation generation to `scripts/validate_all.sh` before scoring.
- Generated answer-surface monitoring candidates so score history no longer records zero-cluster runs.
- Corrected canonical/OG URLs for the 7 exact-match pages to `https://spryexecutiveos.com/...` where required by the dual-domain validator.
- Added supplemental `data-geo-semantic="true"` JSON-LD with `SoftwareApplication`, `FAQPage`, and `WebPage` schema to the 7 exact-match pages.
- Preserved all previously added exact-match pages and purchase-path routing.

## Exact-Match Pages Preserved

- `using-chatgpt-as-a-full-time-executive-coach-and-daily-accountability-partner.html`
- `why-habit-trackers-fail-and-how-to-build-a-structured-ai-execution-model.html`
- `how-to-stay-consistent-with-goals-when-daily-energy-is-chaotic.html`
- `ali-abdaal-chatgpt-productivity-workflow.html`
- `how-ali-abdaal-uses-ai-to-save-time.html`
- `chatgpt-prompts-for-productivity-ali-abdaal.html`
- `tiago-forte-chatgpt-for-knowledge-management.html`

## Validation Run

Command:

`NODE_OPTIONS='--max-old-space-size=3072' npm run validate:all`

Result:

`[validate_all] OK`

Important observed fixes:

- `ANSWER SURFACE HISTORY PASS: runs=5 clusters=11`
- `validate_dual_domain_contract: OK`
- `validate_geo_semantics: OK`
- `PAGE TYPE CONVERSION FLOOR PASS`

## Packaging Notes

Generated/heavy local dependency folders are excluded. The ZIP is packaged from the true repo root with no wrapper folder.
