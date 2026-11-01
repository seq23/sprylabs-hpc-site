#!/usr/bin/env bash
# Search loop (seq23/search-loop), post-build for this site. Runs only when the
# engine published pages. Folds them into the generators' fixed point (sitemaps,
# heads, extraction surfaces) and records their URLs in the cadence ledger.
#
# Why --accept: engine pages are paced by the search loop itself (10/day start,
# +5 a week while most are indexed in 14 days, cap 30, halves when indexing
# falls) - her ruling of 1 Nov 2026 ("publishes straight away"). The legacy
# 6-new-pages-a-week cap in data/cadence/policy.json still governs the Spry
# Content Release lane; without recording the engine's URLs here, the next
# release would count them as its own and stop on weekly_cap.
set -Eeuo pipefail
bash .github/scripts/converge_tree_before_commit.sh search-loop
node scripts/cadence_gate.js --accept --reason "search-loop run ${GITHUB_RUN_ID:-local} on $(date -u +%F): engine pages under /questions/ are paced by the search loop (owner ruling 1 Nov 2026), not by the release lane's weekly cap."
