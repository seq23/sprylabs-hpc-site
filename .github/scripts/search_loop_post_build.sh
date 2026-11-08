#!/usr/bin/env bash
# Search loop post-build (engine input post_build_command; also run by the replay).
# Re-derives exactly what a new /questions/ page needs before it is committed:
#   1. scripts/content/build_spry_rescue.cjs: admits the page into sitemap-spry.xml
#      (and the sitemap index, rescue ledger, knowledge map) and rewrites links to
#      retired routes, as the deploy assembly does.
#   2. build:route-owner-table: routes the new page to spryexecutiveos.com.
# Without it the 7 Nov 2026 run (d7c77b553b) pushed two pages that were in no
# sitemap and no route table, and main went red (tests/spry_rescue.test.mjs,
# tests/route_owner_host.test.mjs). Not the retired whole-site convergence pass.
set -Eeuo pipefail
node -e "require('./scripts/content/build_spry_rescue.cjs').build()"
npm run -s build:route-owner-table
# 3. The two-week blitz ends itself: past blitz.ends_on the config drops back to slow.
node scripts/search_loop_blitz.mjs auto
