# Spry Labs HPC Site

Baseline snapshot package for snapshot-mode repo update.

## Velocity engine

This repo includes a seeded 50-page expansion set plus a Reddit-driven clustering/publish pipeline under `scripts/reddit/` and `docs/runbooks/`.

## Option B Lite distribution

This repo uses the existing dual-sitemap architecture and does **not** add `sitemap-fresh.xml`.

Day-0 setup:

1. Run `bash distribution_scripts/bootstrap_distribution.sh`
2. If bootstrap returns `BOOTSTRAP_OK`, commit + deploy so the committed IndexNow key file is live at repo root on both domains.
3. Add your Search Console service-account JSON path to `distribution.config.json`.
4. Run `npm run distribution:prepare`
5. Run `bash distribution_scripts/deploy_distribution.sh`

### Permanent IndexNow key lifecycle

- The repo now uses a committed stable IndexNow key by default.
- Future full baseline ZIPs must include the configured root key file and `distribution.config.json` with matching `indexnow.key` + `indexnow.key_file`.
- Snapshot updates should **not** require re-bootstrap unless you explicitly want to rotate the key.
- To rotate intentionally, run `INDEXNOW_ROTATE=1 npm run distribution:bootstrap` or `bash distribution_scripts/bootstrap_distribution.sh --rotate`, then commit + deploy the new key file.

## Machine Readability System Layer

This repo includes machine-readable entry points (`llms.txt`, `answers.json`, `coverage.json`, query maps, entity registry, and internal authority graph), a strict backlog-controlled generation layer, social/reddit firehose controls, answer-surface monitoring outputs, distribution artifacts, and validators for crawl, sitemap, CTA, schema, entity, query, authority, and conversion contracts.
