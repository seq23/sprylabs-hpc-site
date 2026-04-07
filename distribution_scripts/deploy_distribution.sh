#!/usr/bin/env bash
set -euo pipefail

PRIMARY_HOST="${1:?Missing primary host, e.g. spryexecutiveos.com}"
INDEXNOW_KEY="${2:?Missing IndexNow key}"
GSC_CREDS="${3:?Missing service account json path}"
GSC_SITE_URL="${4:?Missing GSC siteUrl, e.g. sc-domain:spryexecutiveos.com}"
SPRY_CANONICAL_HOST="${5:-spryexecutiveos.com}"
BHPC_CANONICAL_HOST="${6:-billionairehighperformancecoach.com}"

echo "== 1) Prepare distribution artifacts =="
node scripts/prepare_distribution_artifacts.js

echo
echo "== 2) Submit Google sitemaps =="
python3 distribution_scripts/gsc_submit_sitemaps.py \
  "$GSC_CREDS" \
  "$GSC_SITE_URL" \
  "https://${SPRY_CANONICAL_HOST}/sitemap.xml" \
  "https://${SPRY_CANONICAL_HOST}/sitemap-spry.xml" \
  "https://${BHPC_CANONICAL_HOST}/sitemap-bhpc.xml"

echo
echo "== 3) Submit IndexNow priority URLs =="
./distribution_scripts/indexnow_submit.sh \
  "$PRIMARY_HOST" \
  "$INDEXNOW_KEY" \
  ".build/indexnow-priority.txt"

echo
echo "== 4) Submit IndexNow batch URLs =="
./distribution_scripts/indexnow_submit.sh \
  "$PRIMARY_HOST" \
  "$INDEXNOW_KEY" \
  ".build/indexnow-batch.txt"

echo
echo "== 5) Inspect priority URLs in GSC API =="
python3 distribution_scripts/gsc_inspect_urls.py \
  "$GSC_CREDS" \
  "$GSC_SITE_URL" \
  ".build/distribution-priority-urls.txt" \
  ".build/inspection-results.json"

echo
echo "Done."
echo "Manual Google Request Indexing remains limited to a small priority set."
echo "Recommended manual set: homepage, download, faq, answers hub, comparisons hub, and 5-10 current priority pages."
