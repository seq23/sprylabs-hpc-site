# Spry Labs HPC Site

Baseline snapshot package for snapshot-mode repo update.


## Velocity engine

This repo includes a seeded 50-page expansion set plus a Reddit-driven clustering/publish pipeline under `scripts/reddit/` and `docs/runbooks/`.

## Option B Lite distribution

This repo uses the existing dual-sitemap architecture and does **not** add `sitemap-fresh.xml`.

Day-0 setup:

1. Run `bash distribution_scripts/bootstrap_distribution.sh`
2. Commit + deploy so the generated IndexNow key file is live at repo root on both domains.
3. Add your Search Console service-account JSON path to `distribution.config.json`.
4. Run `npm run distribution:prepare`
5. Run `bash distribution_scripts/deploy_distribution.sh`


### Distribution bootstrap note
After applying a new baseline snapshot, rerun `npm run distribution:bootstrap`, commit the generated root key file, deploy it live, and only then run `npm run distribution:deploy`.
