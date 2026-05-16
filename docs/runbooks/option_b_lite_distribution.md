# Option B Lite Distribution Runbook

## Purpose

This repo has two public host surfaces:

- `spryexecutiveos.com`
- `billionairehighperformancecoach.com`

The distribution lane prepares priority and batch URL files, submits them to IndexNow, and writes a report that proves whether submission ran live or in dry-run mode.

## Workflow

File:

```text
.github/workflows/deploy-distribution.yml
```

Triggers:

```text
push to main
workflow_dispatch
```

Data trace:

```text
push to main / manual dispatch
→ .github/workflows/deploy-distribution.yml
→ npm ci
→ npm run distribution:prepare
→ scripts/prepare_distribution_artifacts.js
→ reads sitemap-spry.xml and sitemap-bhpc.xml
→ writes .build/indexnow-priority.txt
→ writes .build/indexnow-batch.txt
→ writes .build/distribution-priority-urls.txt
→ writes .build/distribution-manifest.json
→ npm run validate:indexnow-workflow
→ validates mixed-host workflow, artifacts, config, key file, and report lane
→ npm run distribution:deploy
→ distribution_scripts/deploy_distribution.sh
→ submits priority URLs through distribution_scripts/indexnow_submit.sh
→ submits batch URLs through distribution_scripts/indexnow_submit.sh
→ writes reports/indexnow-submit-report.json
→ optionally submits GSC sitemap if credentials exist
→ optionally inspects priority URLs through GSC if credentials exist
→ uploads .build and reports/indexnow-submit-report.json as workflow artifacts
```

## Secrets

Required for live IndexNow submission:

```text
INDEXNOW_KEY
```

Current committed key file:

```text
200dca426298c70aabc048344605cccae8dabc0b460f1b3e21eb6e857ef83af1.txt
```

Secret value should match the file contents exactly:

```text
200dca426298c70aabc048344605cccae8dabc0b460f1b3e21eb6e857ef83af1
```

Optional GSC secrets/config are intentionally non-blocking. Missing GSC must not prevent IndexNow submission.

## Manual dry-run

```bash
npm run distribution:prepare
INDEXNOW_DRY_RUN=1 npm run distribution:deploy -- --artifact-dir .build --allow-mixed
npm run validate:indexnow-workflow
```

## Live manual submit

```bash
INDEXNOW_KEY="200dca426298c70aabc048344605cccae8dabc0b460f1b3e21eb6e857ef83af1" npm run distribution:deploy -- --artifact-dir .build --allow-mixed
```

## Report

```text
reports/indexnow-submit-report.json
```

The report contains:

- hosts detected
- priority URL count
- batch URL count
- dry-run/live status
- per-host chunk attempts
- failures, if any

## GSC boundary

Google Search Console sitemap submission and URL Inspection checks are optional and non-blocking in this lane. The workflow may report GSC as skipped if credentials are not present. That is intentional. IndexNow remains the guaranteed lane.
