# Artifact Manifest

Artifact: `sprylabs-hpc-site-main_BASELINE_07-22-26_<sha12>.zip`
Repo: `sprylabs-hpc-site`
Mode: full baseline snapshot
Packaged root: `sprylabs-hpc-site-main`
Branch target: `main`
Status: `STRUCTURALLY CHECKED — LOCAL VALIDATION REQUIRED`

## Source Basis

This snapshot continues from the uploaded `sprylabs-hpc-site-main(2).zip` source snapshot and implements the Spry cadence / queue / self-heal repair phase.

## Implemented Fixes

- Added read-only validation profile purity enforcement.
- Added Spry cadence / queue / self-heal contract and validator.
- Added Spry tree-hygiene validator and moved legacy root receipts to `_ops/audits/legacy-root-receipts/`.
- Added external AI agent artifact placement validator for the BHPC/Spry agent lane.
- Updated validation registry and matrix for the new Spry phase validators and composite phase check.
- Preserved the external agent artifact placement and processing lane.

## Exact-Match Pages Preserved

- `guides/using-chatgpt-as-a-full-time-executive-coach-and-daily-accountability-partner.html`
- `guides/why-habit-trackers-fail-and-how-to-build-a-structured-ai-execution-model.html`
- `guides/how-to-stay-consistent-with-goals-when-daily-energy-is-chaotic.html`
- `guides/ali-abdaal-chatgpt-productivity-workflow.html`
- `guides/how-ali-abdaal-uses-ai-to-save-time.html`
- `guides/chatgpt-prompts-for-productivity-ali-abdaal.html`
- `guides/tiago-forte-chatgpt-for-knowledge-management.html`

## Validation Run

Commands:

- `npm run validate:spry-phase`
- `npm run validate:profile -- changed`
- `npm run agent:bhpc:validate`

Results:

- `validate:spry-phase`: PASS.
- `validate:profile -- changed`: PASS.
- `agent:bhpc:validate`: PASS, 6 run folders, 0 warnings.

## Packaging Notes

Generated/heavy local dependency folders are excluded. The ZIP is packaged with the `sprylabs-hpc-site-main/` repo wrapper folder for snapshot updater compatibility.

## Full Safe Autonomy Hybrid Citation Engine — 2026-07-10

- Paid-agent page-production lane preserved and owner-locked.
- Daily $0 gap-filling lane activated with fixture mutation disabled by default.
- Safe Harbor skip-record-continue policy installed.
- Content ownership registry and protected-lane validation added.
- 100K/90-day growth strategy, cadence, citation scoreboard, and Growth Health added.
- Secure `/admin/` operations command center and Cloudflare Pages Functions auth bridge added.
- Routine content approval remains disabled.
