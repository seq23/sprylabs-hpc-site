#!/usr/bin/env bash
# Serves aplayermode.com locally the way production does, for the ship-ready baseline (ship-ready.json).
#
# Production: the aplayermode.com Worker (workers/aplayermode-com) answers every request and reads the
# page files from the Pages project. A static serve of aplayermode/ cannot reproduce that: the pages link
# /about/, /students/ and the other content pages at the domain root, which only the Worker's route table
# maps onto files. So this runs the real pair, built from THIS checkout:
#   1. `wrangler pages dev` of .pages-output (scripts/assemble_pages_output.js) on 127.0.0.1:8788,
#      started from inside .pages-output so no Pages Functions or bindings are involved (the Worker only
#      reads static files from its origin);
#   2. `wrangler dev` of the Worker on 127.0.0.1:4173 with APM_ORIGIN pointing at (1). The Worker honours
#      APM_ORIGIN only for a loopback address (originOf in src/index.js).
# Local only: nothing is deployed, nothing reaches Cloudflare. Stops both servers when it is stopped.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .pages-output/aplayermode/index.html ] || { echo "NAMED STOP [APM_RENDER_NO_BUILD] .pages-output is missing; run node scripts/assemble_pages_output.js first" >&2; exit 2; }
export WRANGLER_SEND_METRICS=false CI=1
WRANGLER="npx --yes wrangler@4.158.0"
pids=()
trap 'kill "${pids[@]}" 2>/dev/null || true' EXIT INT TERM
(cd .pages-output && exec $WRANGLER pages dev . --ip 127.0.0.1 --port 8788 --inspector-port 9231 --compatibility-date 2026-08-26) & pids+=($!)
$WRANGLER dev --config workers/aplayermode-com/wrangler.jsonc --ip 127.0.0.1 --port 4173 --inspector-port 9232 \
  --var APM_ORIGIN:http://127.0.0.1:8788 & pids+=($!)
wait
