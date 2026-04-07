#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
HOST_FILTER="${1:-}"
URL_FILE_OVERRIDE="${2:-}"
python3 - <<'PY' "$HOST_FILTER" "$URL_FILE_OVERRIDE"
import json, sys, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path('distribution_scripts').resolve()))
from distribution_common import load_config, read_urls, filter_urls_for_host

host_filter = sys.argv[1].strip()
url_file_override = sys.argv[2].strip()
root = Path('.').resolve()
config = load_config()
idx = config['indexnow']
key = idx.get('key', '').strip()
key_file = idx.get('key_file', '').strip()
if not key or not key_file:
    raise SystemExit('ERROR: IndexNow key not configured. Run: bash distribution_scripts/bootstrap_distribution.sh')
key_path = root / key_file
if not key_path.exists() or key_path.read_text(encoding='utf-8').strip() != key:
    raise SystemExit(f'ERROR: Key file missing or mismatched at repo root: {key_file}')
hosts = idx.get('hosts', [])
if host_filter:
    hosts = [h for h in hosts if h == host_filter]
    if not hosts:
        raise SystemExit(f'ERROR: Host not found in distribution.config.json: {host_filter}')
files = [url_file_override] if url_file_override else [idx['priority_file'], idx['batch_file']]
for file_path in files:
    urls = read_urls(file_path)
    for host in hosts:
        host_urls = filter_urls_for_host(urls, host)
        if not host_urls:
            print(f'SKIP {host} {file_path} (0 urls)')
            continue
        payload = {'host': host, 'key': key, 'urlList': host_urls}
        req = urllib.request.Request(
            'https://api.indexnow.org/indexnow',
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json; charset=utf-8'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode('utf-8', errors='replace')
            print(f'INDEXNOW_OK host={host} file={file_path} urls={len(host_urls)} status={resp.status}')
            if body.strip():
                print(body.strip())
PY
