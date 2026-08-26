#!/usr/bin/env bash
set -Eeuo pipefail

cleanup() { rm -f .gsc-service-account.json; }
trap cleanup EXIT

node scripts/search_intelligence/prove_agent_separation.mjs --snapshot
npm run search:targets
npm run search:observe
npm run search:competitors

# The provider_inputs directory holds only run outputs, so it is not tracked and
# does not exist on a fresh checkout. gsc_search_analytics.py writes into it and
# does not create it, so the cycle died with FileNotFoundError on every run that
# had credentials - the rm below cannot create it either.
mkdir -p data/search_intelligence/provider_inputs
rm -f data/search_intelligence/provider_inputs/gsc_bhpc.json data/search_intelligence/provider_inputs/gsc_spry.json .gsc-service-account.json
if [ -n "${GSC_SERVICE_ACCOUNT_JSON:-}" ]; then
  printf '%s' "$GSC_SERVICE_ACCOUNT_JSON" > .gsc-service-account.json
  if [ -n "${GSC_SITE_URL_BHPC:-}" ]; then
    python3 scripts/search_intelligence/gsc_search_analytics.py .gsc-service-account.json "$GSC_SITE_URL_BHPC" data/search_intelligence/target_query_set.json data/search_intelligence/provider_inputs/gsc_bhpc.json
  fi
  if [ -n "${GSC_SITE_URL_SPRY:-}" ]; then
    python3 scripts/search_intelligence/gsc_search_analytics.py .gsc-service-account.json "$GSC_SITE_URL_SPRY" data/search_intelligence/target_query_set.json data/search_intelligence/provider_inputs/gsc_spry.json
  fi
else
  echo "GSC credential unavailable; truth lane will report UNAVAILABLE."
fi

npm run search:truth
npm run search:diagnose
npm run search:repair:prepare
npm run search:repair:apply
npm run agency:build
npm run site:build
npm run validate:search-intelligence
npm run validate:changed

# Same-query retest after any bounded repair. Provider unavailability remains explicit, never green.
npm run search:observe
npm run search:competitors
npm run search:truth
npm run search:retest
npm run search:evidence
npm run search:status
npm run agency:build
npm run site:build
npm run validate:search-intelligence
node scripts/search_intelligence/prove_agent_separation.mjs --check
