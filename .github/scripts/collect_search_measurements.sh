#!/usr/bin/env bash
# Search Console measurements only (7 Nov 2026). The old search-intelligence
# cycle also diagnosed and rewrote pages; that engine is retired and Search Loop
# owns pages. This keeps the measurement the weekly outcome report and Boss OS's
# "Spry Labs weekly" email read: data/search_intelligence/gsc_truth.json and
# each host's index coverage.
set -Eeuo pipefail
cleanup() { rm -f .gsc-service-account.json; }
trap cleanup EXIT
npm run -s search:targets
mkdir -p data/search_intelligence/provider_inputs
rm -f data/search_intelligence/provider_inputs/gsc_bhpc.json data/search_intelligence/provider_inputs/gsc_spry.json
if [ -z "${GSC_SERVICE_ACCOUNT_JSON:-}" ]; then
  echo "NAMED STOP [GSC_CREDENTIAL_MISSING] GSC_SERVICE_ACCOUNT_JSON is not set; gsc_truth.json will record UNAVAILABLE rather than a number."
else
  umask 077
  printf '%s' "$GSC_SERVICE_ACCOUNT_JSON" > .gsc-service-account.json
  measure() {
    local key="$1" site_url="$2" host="$3" map="$4"
    if [ -z "$site_url" ]; then echo "NAMED STOP [GSC_SITE_URL_MISSING] no Search Console property for ${host}"; return 0; fi
    python3 scripts/search_intelligence/gsc_search_analytics.py .gsc-service-account.json "$site_url" data/search_intelligence/target_query_set.json "data/search_intelligence/provider_inputs/gsc_${key}.json"
    python3 scripts/search_intelligence/collect_index_coverage.py .gsc-service-account.json "$site_url" "$host" "$map"
  }
  measure bhpc "${GSC_SITE_URL_BHPC:-}" billionairehighperformancecoach.com sitemap-bhpc.xml
  measure spry "${GSC_SITE_URL_SPRY:-}" spryexecutiveos.com sitemap-spry.xml
fi
npm run -s search:truth
echo "OUTPUT search-measurements: $(node -e 'const t=require("./data/search_intelligence/gsc_truth.json");console.log(t.status||t.overall_status||"written")' 2>/dev/null || echo unreadable)"
