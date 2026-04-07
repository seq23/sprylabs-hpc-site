#!/usr/bin/env bash
set -euo pipefail

HOST="${1:?Missing host, e.g. spryexecutiveos.com}"
KEY="${2:?Missing IndexNow key}"
URL_FILE="${3:?Missing URL file path}"

if [[ ! -f "$URL_FILE" ]]; then
  echo "ERROR: URL file not found: $URL_FILE"
  exit 1
fi

if [[ ! -f "${KEY}.txt" ]]; then
  echo "WARNING: ${KEY}.txt not found in current directory."
  echo "Expected public URL: https://${HOST}/${KEY}.txt"
fi

TMP_JSON="$(mktemp)"
python3 - <<'PY' "$HOST" "$KEY" "$URL_FILE" "$TMP_JSON"
import json, pathlib, sys
host = sys.argv[1]
key = sys.argv[2]
url_file = pathlib.Path(sys.argv[3])
tmp_json = pathlib.Path(sys.argv[4])
urls = [line.strip() for line in url_file.read_text(encoding='utf-8').splitlines() if line.strip()]
payload = {"host": host, "key": key, "urlList": urls}
tmp_json.write_text(json.dumps(payload, indent=2), encoding='utf-8')
print(f"Wrote payload with {len(urls)} URLs to {tmp_json}")
PY

curl -sS -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary @"$TMP_JSON"
echo
rm -f "$TMP_JSON"
echo "IndexNow submission complete."
