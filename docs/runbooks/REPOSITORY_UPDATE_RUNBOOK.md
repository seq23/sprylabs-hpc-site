# Repository Update Runbook

## Repository

- Identity: `seq23/sprylabs-hpc-site`
- Branch: `main`
- Node: 24
- Package manager: npm
- Update artifact: full baseline ZIP

## Preflight

Confirm `pwd`, Git root, root basename, remote, branch, and clean status. Locate and inspect the active `update_repo_from_zip_generic_v3_1.sh`; do not infer its arguments from this document.

## Artifact requirements

The ZIP must contain one `sprylabs-hpc-site-main/` wrapper and open directly to the repo root. It must exclude `.git`, `node_modules`, active environment files, auth state, logs, Playwright results, and generated diagnostics. Run `unzip -t` before use.

## Local updater gate

The updater must set `RELEASE_EXECUTION_ENV=local` and run `npm run release:prepush`. Local mode may not downgrade to the container profile. A missing Playwright Chromium binary must halt before commit or push.

## Success sequence

1. Apply the verified full ZIP.
2. Run the local prepush profile.
3. Preserve browser evidence externally.
4. Commit, tag, and push only after green local proof.
5. Inspect GitHub Actions and deployment.
6. Run `npm run release:close-lifecycle` for deployed proof.

## Failure handling

Do not patch the local repo invisibly. Repair the ZIP source, rebuild the complete baseline artifact, reopen it, and restart the updater from the beginning.

## Snapshot reentry protection

Baseline ZIP commits may carry raw agent-run manifests that were already absorbed into normalized files, rendered pages, and reports. The mutating `spry-content-release` workflow must not reprocess those manifests merely because the snapshot touched `data/report_fixes/agent_runs/**/agent_run_manifest.json`.

The canonical snapshot commit message remains:

```text
snapshot update from baseline ZIP
```

Push-triggered `spry-content-release` jobs skip that commit message. Manual and scheduled runs continue to operate normally.

## Metadata hygiene severity

Duplicate meta descriptions are warning-level metadata hygiene unless paired with a stronger correctness failure such as duplicate titles, canonical mismatch, missing description, wrong domain, missing schema, mojibake, or broken required links. The updater should not reject a baseline only because two pages share a meta description.
