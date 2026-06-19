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
