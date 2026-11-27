#!/usr/bin/env bash
# Search loop post-build for aplayermode.com (engine input post_build_command of the
# search-loop-aplayermode job; also run by the replay). Re-derives what a new
# /questions/ page on the apex needs before it is committed:
#   1. the /questions/ index (scripts/aplayermode/build_questions_index.mjs), which every
#      engine page's breadcrumb names and which links each page from the site;
#   2. aplayermode/sitemap.xml and its lastmod record (scripts/aplayermode_sitemap_lastmod.mjs),
#      which list every committed question page.
# The route owner table needs no rebuild: it never lists files under aplayermode/.
set -Eeuo pipefail
node scripts/aplayermode/build_questions_index.mjs
node scripts/aplayermode_sitemap_lastmod.mjs
