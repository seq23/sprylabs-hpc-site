# Option B-lite distribution runbook

## Purpose

This repo uses a lighter distribution layer around the existing dual-domain sitemap setup. It does not add `sitemap-fresh.xml`.

## Existing sitemap architecture

- `sitemap.xml`
- `sitemap-spry.xml`
- `sitemap-bhpc.xml`

## Prepare artifacts

```bash
npm run distribution:prepare
```

This writes:

- `.build/indexnow-priority.txt`
- `.build/indexnow-batch.txt`
- `.build/distribution-priority-urls.txt`
- `.build/distribution-readme.txt`
- `.build/distribution-manifest.json`

## Distribution command

```bash
./distribution_scripts/deploy_distribution.sh \
  spryexecutiveos.com \
  YOUR_INDEXNOW_KEY \
  service-account.json \
  "sc-domain:spryexecutiveos.com"
```

## What remains manual

Google Request Indexing remains manual and should be limited to a small priority set.
