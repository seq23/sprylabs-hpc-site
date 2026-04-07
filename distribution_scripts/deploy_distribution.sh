#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

npm run distribution:prepare

python3 - <<'PY'
import sys
from pathlib import Path
sys.path.insert(0, str(Path('distribution_scripts').resolve()))
from distribution_common import load_config
config = load_config()
if not config['indexnow'].get('key', '').strip():
    raise SystemExit('ERROR: IndexNow key missing. Run: bash distribution_scripts/bootstrap_distribution.sh')
print('CONFIG_OK')
PY

python3 distribution_scripts/gsc_submit_sitemaps.py
bash distribution_scripts/indexnow_submit.sh
python3 distribution_scripts/gsc_inspect_urls.py

echo
echo 'DONE'
echo 'Manual step: in Search Console, request indexing for 5-10 highest-priority URLs only.'
