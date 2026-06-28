# Spry HPC 06-27 Reconciliation Report

Status: STRUCTURALLY CHECKED — LOCAL VALIDATION REQUIRED

Source of truth: `sprylabs-hpc-site-main.zip` uploaded after the earlier pantry/root-fix snapshots.

## Reconciled inputs

- Found `data/report_fixes/agent_runs/2026-06-27/bhpc/agent_run_manifest.json`.
- Found `data/report_fixes/agent_runs/2026-06-27/bhpc/bhpc.csv`.
- Found `data/report_fixes/agent_runs/2026-06-27/bhpc/bhpc.html`.
- Did not find `data/report_fixes/agent_runs/2026-06-24/trt/` in this source ZIP.

## Changes applied

- Added `agent:bhpc:apply-exact` to materialize exact implementation pages from the agent exact implementation plan.
- Updated `workflow:content-authority` so the exact-apply step runs immediately after planning and before content pipeline/postprocess.
- Materialized 29 BHPC exact implementation pages/repairs from the 6/27 run.
- Added active IndexNow batch budget enforcement.
- Capped active `.build/indexnow-batch.txt` to 100 URLs.
- Added `.build/indexnow-deferred-batch.txt` for overflow URLs.
- Reconciled HPC pantry expansion files and validators into the latest source of truth.

## Validation performed in artifact environment

- `npm run agent:bhpc:validate`
- `npm run agent:bhpc:absorb`
- `npm run agent:bhpc:plan-exact`
- `npm run agent:bhpc:apply-exact`
- Content pipeline stages through `build:postprocess` were isolated and completed.
- `npm run agent:bhpc:trace-exact` passed with 29 specs.
- `npm run agent:bhpc:validate-exact` passed.
- `npm run validate:hpc-pantry` passed.
- `npm run trace:hpc-pantry` passed.
- `npm run validate:workflow-contract` passed.
- `npm run validate:workflow-lineage` passed.
- `npm run validate:workflow-monitor` passed.
- `INDEXNOW_DRY_RUN=1 npm run distribution:deploy -- --artifact-dir .build --allow-mixed` passed.
- `npm run validate:indexnow-batch-budget` passed.

## Remaining proof boundary

Live GitHub Actions and live IndexNow provider behavior must run after applying the baseline locally through the updater.
