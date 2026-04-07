#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
python3 - <<'PY'
import secrets
from pathlib import Path
import sys
sys.path.insert(0, str(Path('distribution_scripts').resolve()))
from distribution_common import load_config, write_config

root = Path('.').resolve()
config = load_config()
key = config.get('indexnow', {}).get('key', '').strip() or secrets.token_hex(16).upper()
key_file = f"{key}.txt"
(root / key_file).write_text(key, encoding='utf-8')
config['indexnow']['key'] = key
config['indexnow']['key_file'] = key_file
write_config(config)
print(f"BOOTSTRAP_OK key={key}")
print(f"Created {key_file} at repo root")
print("Next steps:")
print("1) Commit and deploy the repo so the key file is live on both domains.")
print("2) Add your Search Console service-account JSON path to distribution.config.json if you want GSC automation.")
print("3) Run: npm run distribution:prepare")
print("4) Run: bash distribution_scripts/deploy_distribution.sh")
PY
