# Option B Lite distribution

This repo keeps the existing sitemap architecture:

- `sitemap.xml`
- `sitemap-spry.xml`
- `sitemap-bhpc.xml`

It does **not** add `sitemap-fresh.xml`.

## Day-0 setup

1. Run `bash distribution_scripts/bootstrap_distribution.sh`
2. Commit and deploy the generated root key file.
3. Edit `distribution.config.json` and add your Search Console service-account JSON path.
4. Run `npm run distribution:prepare`
5. Run `bash distribution_scripts/deploy_distribution.sh`

## What runs automatically

- GSC sitemap submission for both domain properties
- IndexNow submission for both hosts
- URL inspection status checks for the priority set

## What stays manual

In Google Search Console, manually request indexing for 5-10 highest-priority URLs only.


## IndexNow batching

The repo splits IndexNow submissions by hostname and submits them in chunks using `indexnow.chunk_size` from `distribution.config.json`. This prevents mixed-host payloads and reduces 403 failures on large submissions.
