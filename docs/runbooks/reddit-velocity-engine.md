# Community-Question Velocity Engine

## Naming note
This repo still uses `reddit` in internal file and script names because that is the historical pipeline name.
Operationally, this should be understood as the community-question clustering and velocity engine.
Public-facing framing should stay neutral and should not rely on platform-specific wording unless the page explicitly requires it.

## Process map
1. Fetch approved community inputs.
2. Normalize public-question language.
3. Cluster repeated questions.
4. Score clusters.
5. Generate or select pages.
6. Apply fan-out coverage when needed.
7. Validate repo.
8. Update sitemap, feed, and logs.
9. Commit snapshot only if validation passes.

## Owner + VA SOP
- Owner approves input sources and publish threshold.
- VA may run workflow dispatches, inspect logs, and confirm sitemap/feed changes.
- VA may not lower thresholds, bypass validators, or add new templates.

## Manual fallback SOP
Run in order:
- `node scripts/reddit/fetch_reddit.js`
- `node scripts/reddit/normalize_reddit.js`
- `node scripts/reddit/cluster_questions.js`
- `node scripts/reddit/score_clusters.js`
- `node scripts/reddit/generate_pages.js`
- `node scripts/reddit/publish_daily.js`
- `node scripts/reddit/update_velocity_indexes.js`
- `npm run fanout:apply`
- `npm run validate:all`

## Verification checklist
- Queue file updated.
- Archive log written.
- Generated pages exist and validate.
- Fan-out manifests refreshed.
- `sitemap-bhpc.xml` contains generated routes.
- `feed.xml` and `feed.json` refreshed.
- No duplicate titles/descriptions.
- Required links present.

## Rollback
- Restore previous baseline ZIP/tag.
- Compare diff against `data/reddit/archive/*` logs.
- Fix generator rules, then rerun from fetch or queue stage.
