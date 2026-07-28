# Spry HPC Workflow Repair Ledger — 2026-07-28

## Scope

Repair the Spry HPC GitHub workflow failure surfaced in `workflow:zero-dollar-autonomous` and trace every repository workflow path available in the snapshot.

## Implemented

- `release:zero-dollar-autonomous` now runs `authority:scale:fanout` before `validate:authority-scale`, which creates `data/intake/source_ingestion/max_fanout_window.json` before the validator reads it.
- `distribution:indexnow` now supplies the default `.build/indexnow-priority.txt` file to `scripts/distribution/indexnow_submit.sh`, repairing the admin `submit_updated_pages` workflow path.
- `frozen_outputs.mjs` now supports `prepare-drift-scope`, an exact post-run changed-route scope for governed content release lanes.
- `run_guarded_release.mjs` now records that exact post-run changed-route scope before freezing accepted outputs, preventing intended governed release mutations from being misclassified as unscoped drift.

## Workflow trace coverage

- GitHub workflow files inventoried: 8.
- Scenario-level faux traces generated: 33.
- Workflow topology validators passed.
- Workflow write-scope validators passed.
- Workflow runtime-mutation validators passed.
- Workflow artifact validators passed.
- Browserless fallback proof passed.

## Direct command proof run in the sandbox

- `npm run workflow:zero-dollar-autonomous` passed.
- `npm run validate:authority-scale` passed after repair with `operational_window: 5000`.
- `python3 scripts/validation/faux_trace_all_workflows.py` passed with 8 workflows and 33 scenarios.
- `npm run test:browserless-mock-backup` passed.
- `INDEXNOW_DRY_RUN=1 npm run distribution:indexnow` passed.
- `INDEXNOW_DRY_RUN=1 npm run distribution:deploy` passed.

## Proof boundary

The full browser suite and live Cloudflare postdeploy checks were not run in this sandbox. IndexNow/GSC provider mutations were run in dry-run or skipped-provider mode. Full local updater validation remains the authority after apply.
