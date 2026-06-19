#!/usr/bin/env bash
set -euo pipefail

# Distribution deploy lane.
# IndexNow is the guaranteed first-class lane. GSC is optional/non-blocking.
# Usage:
#   distribution_scripts/deploy_distribution.sh --key "$INDEXNOW_KEY" --artifact-dir .build --allow-mixed
# Optional GSC:
#   --creds service-account.json --gsc-site sc-domain:example.com

HOST=""
KEY="${INDEXNOW_KEY:-}"
ARTIFACT_DIR=""
GSC_CREDS="${GSC_SERVICE_ACCOUNT_JSON_PATH:-}"
GSC_SITE_URL="${GSC_SITE_URL:-}"
ALLOW_MIXED="0"
REPORT_PATH="reports/indexnow-submit-report.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:?}"; shift 2 ;;
    --key) KEY="${2:?}"; shift 2 ;;
    --artifact-dir) ARTIFACT_DIR="${2:?}"; shift 2 ;;
    --creds) GSC_CREDS="${2:?}"; shift 2 ;;
    --gsc-site) GSC_SITE_URL="${2:?}"; shift 2 ;;
    --allow-mixed) ALLOW_MIXED="1"; shift 1 ;;
    --report) REPORT_PATH="${2:?}"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$ARTIFACT_DIR" ]]; then
  if [[ -f ".build/indexnow-priority.txt" && -f ".build/indexnow-batch.txt" ]]; then
    ARTIFACT_DIR=".build"
  elif [[ -f "dist/indexnow-priority.txt" && -f "dist/indexnow-batch.txt" ]]; then
    ARTIFACT_DIR="dist"
  else
    echo "ERROR: could not detect artifact dir (.build or dist)" >&2
    exit 1
  fi
fi

PRIORITY_FILE="${ARTIFACT_DIR}/indexnow-priority.txt"
BATCH_FILE="${ARTIFACT_DIR}/indexnow-batch.txt"

[[ -f "$PRIORITY_FILE" ]] || { echo "ERROR: missing $PRIORITY_FILE" >&2; exit 1; }
[[ -f "$BATCH_FILE" ]] || { echo "ERROR: missing $BATCH_FILE" >&2; exit 1; }

if [[ -z "$KEY" && -f distribution.config.json ]]; then
  KEY="$(node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('distribution.config.json','utf8')); process.stdout.write((c.indexnow&&c.indexnow.key)||'')" 2>/dev/null || true)"
fi
if [[ -z "$KEY" && "${INDEXNOW_DRY_RUN:-0}" == "1" ]]; then KEY="dry-run-key"; fi
[[ -n "$KEY" ]] || { echo "ERROR: INDEXNOW_KEY/--key is required or distribution.config.json must define indexnow.key" >&2; exit 1; }

submit_args=(--key "$KEY" --allow-mixed --report "$REPORT_PATH")
if [[ -n "$HOST" ]]; then
  submit_args+=(--host "$HOST")
fi

echo "== Distribution config =="
echo "HOST=${HOST:-mixed/detected}"
echo "ARTIFACT_DIR=$ARTIFACT_DIR"
echo "PRIORITY_FILE=$PRIORITY_FILE"
echo "BATCH_FILE=$BATCH_FILE"
echo "REPORT_PATH=$REPORT_PATH"
echo

echo "== 1) Submit IndexNow priority URLs =="
distribution_scripts/indexnow_submit.sh "${submit_args[@]}" --file "$PRIORITY_FILE" --label priority

echo
echo "== 2) Submit IndexNow batch URLs =="
distribution_scripts/indexnow_submit.sh "${submit_args[@]}" --file "$BATCH_FILE" --label batch

echo
echo "== 3) Optional Google Search Console sitemap submission =="
if [[ -n "$GSC_CREDS" && -n "$GSC_SITE_URL" && -f "$GSC_CREDS" ]]; then
  if [[ -n "$HOST" ]]; then
    sitemaps=("https://${HOST}/sitemap.xml")
    if [[ "$HOST" == "spryexecutiveos.com" ]]; then sitemaps=("https://spryexecutiveos.com/sitemap-spry.xml"); fi
    if [[ "$HOST" == "billionairehighperformancecoach.com" ]]; then sitemaps=("https://billionairehighperformancecoach.com/sitemap-bhpc.xml"); fi
    python3 distribution_scripts/gsc_submit_sitemaps.py "$GSC_CREDS" "$GSC_SITE_URL" "${sitemaps[@]}" || true
  else
    echo "GSC skipped: mixed-host deployment should use per-host GSC runs or configured site matrix."
  fi
else
  echo "GSC skipped: credentials/site secret not present. IndexNow was not blocked."
fi

echo
echo "== 4) Optional GSC URL inspection =="
if [[ -n "$GSC_CREDS" && -n "$GSC_SITE_URL" && -f "$GSC_CREDS" ]]; then
  if [[ -n "$HOST" ]]; then
    python3 distribution_scripts/gsc_inspect_urls.py "$GSC_CREDS" "$GSC_SITE_URL" "$PRIORITY_FILE" "${ARTIFACT_DIR}/inspection-results.json" || true
  else
    echo "GSC inspection skipped: mixed-host deployment should use per-host GSC runs."
  fi
else
  echo "GSC inspection skipped: credentials/site secret not present."
fi

echo
echo "Done. IndexNow report: $REPORT_PATH"
