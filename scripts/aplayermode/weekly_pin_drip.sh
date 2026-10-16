#!/usr/bin/env bash
# aplayermode.com Pinterest drip: the weekly half (owner-approved 16 Oct 2026).
#
# Runs inside the Daily Citation Intelligence lane (.github/workflows/
# daily-citation-intelligence.yml, which commits through the shared push helper) so
# the repo's governed workflow topology stays as reviewed. It acts on Mondays in
# America/Chicago, or any day when PIN_DRIP_FORCE=1 (the lane's pin_drip dispatch
# input); other days it prints a named skip and exits 0.
#
# The daily release needs nothing here: the aplayermode-com Worker builds
# https://aplayermode.com/pinfeed.xml at request time from
# aplayermode/data/pinterest/queue.json. This keeps that queue stocked ($0):
#   1. scripts/aplayermode/pin_queue.mjs: fewer than 14 unreleased -> plan, render
#      and date 21 more from template copy; PINTEREST_QUEUE_EXHAUSTED (exit 1) if
#      a refill is due and nothing new can be made.
#   2. Guards: validate:aplayermode-pin-drip + validate:aplayermode-pinterest.
#   3. scripts/aplayermode/collect_pin_metrics.mjs: Pinterest-referred visits per pin
#      from the Worker's Analytics Engine edge log, or the named stop
#      PINTEREST_METRICS_UNAVAILABLE naming the secret (CLOUDFLARE_API_TOKEN).
set -Eeuo pipefail
if [ "$(TZ=America/Chicago date +%u)" != "1" ] && [ "${PIN_DRIP_FORCE:-0}" != "1" ]; then
  echo "[pin-drip] SKIPPED: weekly step runs on Mondays (America/Chicago); today is $(TZ=America/Chicago date +%A). Set PIN_DRIP_FORCE=1 to run now."
  exit 0
fi
npx playwright install --with-deps chromium >/dev/null
node scripts/aplayermode/pin_queue.mjs
npm run -s validate:aplayermode-pin-drip
npm run -s validate:aplayermode-pinterest
node scripts/aplayermode/collect_pin_metrics.mjs
