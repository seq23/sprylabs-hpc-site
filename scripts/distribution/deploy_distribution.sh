#!/usr/bin/env bash
set -euo pipefail

# Distribution deploy lane.
# IndexNow only. Usage:
#   scripts/distribution/deploy_distribution.sh --key "$INDEXNOW_KEY" --artifact-dir .build --allow-mixed
#
# Search Console is NOT in this script. It used to carry a second, single-host GSC
# lane that read GSC_SERVICE_ACCOUNT_JSON_PATH and GSC_SITE_URL. The workflow step
# that calls this script never set either (and CI is always mixed-host), so every
# run printed "GSC skipped: credentials/site secret not present" while the secret
# existed and the real per-domain lane ran in the next step. Two GSC lanes with two
# ideas of their inputs is the defect; the per-domain step in
# .github/workflows/deploy-distribution.yml is now the only one.
# validate:workflow-step-env-contract fails if a step's env and its script disagree.

HOST=""
KEY="${INDEXNOW_KEY:-}"
ARTIFACT_DIR=""
ALLOW_MIXED="0"
REPORT_PATH="reports/indexnow-submit-report.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:?}"; shift 2 ;;
    --key) KEY="${2:?}"; shift 2 ;;
    --artifact-dir) ARTIFACT_DIR="${2:?}"; shift 2 ;;
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
scripts/distribution/indexnow_submit.sh "${submit_args[@]}" --file "$PRIORITY_FILE" --label priority

echo
echo "== 2) Submit IndexNow batch URLs =="
scripts/distribution/indexnow_submit.sh "${submit_args[@]}" --file "$BATCH_FILE" --label batch

echo
echo "== 3) Submit IndexNow URLs for hosts with their own key (indexnow.host_keys) =="
# aplayermode.com is served by its own Worker, not the shared Pages hosts, so it
# carries its own key file and is pinged with that key. Missing host_keys config,
# an empty URL list or a key file that does not hold the key fails the deploy
# rather than skipping it silently (16 Oct 2026: Search Console found no key).
host_keys_tsv="$(ARTIFACT="$ARTIFACT_DIR" node -e "
const fs=require('fs');
const c=JSON.parse(fs.readFileSync('distribution.config.json','utf8'));
const hk=(c.indexnow&&c.indexnow.host_keys)||{};
const rows=Object.entries(hk);
if(!rows.length){console.error('ERROR: distribution.config.json indexnow.host_keys is empty');process.exit(1);}
for(const [host,h] of rows){
  const k=String(h.key||'').trim();
  if(!/^[a-f0-9]{8,128}$/.test(k)){console.error('ERROR: '+host+' key is not 8-128 hex chars');process.exit(1);}
  if(fs.readFileSync(h.key_file,'utf8').trim()!==k){console.error('ERROR: '+h.key_file+' does not hold the '+host+' key');process.exit(1);}
  const urls=[...fs.readFileSync(h.urls_from,'utf8').matchAll(/<loc>([^<]+)<\\/loc>/g)].map(m=>m[1].trim()).filter(u=>new URL(u).host===host);
  if(!urls.length){console.error('ERROR: '+h.urls_from+' lists no '+host+' URLs');process.exit(1);}
  fs.writeFileSync(process.env.ARTIFACT+'/indexnow-'+host+'.txt',urls.join('\\n')+'\\n');
  process.stdout.write(host+'\\t'+k+'\\n');
}")"
while IFS=$'\t' read -r hk_host hk_key; do
  [[ -n "$hk_host" ]] || continue
  scripts/distribution/indexnow_submit.sh --key "$hk_key" --host "$hk_host" \
    --file "${ARTIFACT_DIR}/indexnow-${hk_host}.txt" --label "host-key-${hk_host}" \
    --report "${REPORT_PATH%.json}-${hk_host}.json"
done <<< "$host_keys_tsv"
echo

echo "Done. IndexNow report: $REPORT_PATH"
