#!/usr/bin/env bash
set -euo pipefail

# IndexNow submitter with dry-run/report support.
# Usage:
#   distribution_scripts/indexnow_submit.sh --key "$INDEXNOW_KEY" --file .build/indexnow-priority.txt --allow-mixed --label priority
# Optional:
#   --host example.com       Require/suggest a single host unless --allow-mixed is set
#   --report reports/indexnow-submit-report.json
#   --dry-run                Same as INDEXNOW_DRY_RUN=1

HOST=""
KEY="${INDEXNOW_KEY:-}"
URL_FILE=""
ALLOW_MIXED="0"
LABEL=""
REPORT_PATH="reports/indexnow-submit-report.json"
DRY_RUN="${INDEXNOW_DRY_RUN:-0}"
ENDPOINT="${INDEXNOW_ENDPOINT:-https://api.indexnow.org/indexnow}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:?}"; shift 2 ;;
    --key) KEY="${2:?}"; shift 2 ;;
    --file) URL_FILE="${2:?}"; shift 2 ;;
    --allow-mixed) ALLOW_MIXED="1"; shift 1 ;;
    --label) LABEL="${2:?}"; shift 2 ;;
    --report) REPORT_PATH="${2:?}"; shift 2 ;;
    --dry-run) DRY_RUN="1"; shift 1 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

[[ -n "$URL_FILE" ]] || { echo "ERROR: --file is required" >&2; exit 1; }
[[ -f "$URL_FILE" ]] || { echo "ERROR: URL file not found: $URL_FILE" >&2; exit 1; }

if [[ -z "$LABEL" ]]; then
  base="$(basename "$URL_FILE")"
  case "$base" in
    *priority*) LABEL="priority" ;;
    *batch*) LABEL="batch" ;;
    *) LABEL="$base" ;;
  esac
fi

if [[ -z "$KEY" ]]; then
  if [[ -f "distribution.config.json" ]]; then
    KEY="$(node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('distribution.config.json','utf8')); process.stdout.write((c.indexnow&&c.indexnow.key)||'')" 2>/dev/null || true)"
  fi
fi

if [[ -z "$KEY" && "${INDEXNOW_DRY_RUN:-0}" == "1" ]]; then KEY="dry-run-key"; fi
[[ -n "$KEY" ]] || { echo "ERROR: INDEXNOW_KEY/--key is required or distribution.config.json must define indexnow.key" >&2; exit 1; }

mkdir -p "$(dirname "$REPORT_PATH")"

tmp_clean="$(mktemp)"
python3 - <<'PY' "$URL_FILE" "$tmp_clean"
import pathlib, sys
src = pathlib.Path(sys.argv[1])
dst = pathlib.Path(sys.argv[2])
urls = []
for raw in src.read_text(encoding="utf-8").splitlines():
    line = raw.strip().replace("<loc>", "").replace("</loc>", "").strip()
    if line:
        urls.append(line)
dst.write_text("\n".join(urls) + ("\n" if urls else ""), encoding="utf-8")
print(f"Prepared {len(urls)} URL lines from {src}")
PY

python3 - <<'PY' "$tmp_clean" "$HOST" "$KEY" "$ALLOW_MIXED" "$DRY_RUN" "$ENDPOINT" "$REPORT_PATH" "$LABEL" "$URL_FILE"
import json, os, pathlib, sys, urllib.parse, urllib.request, urllib.error, datetime, math

url_file = pathlib.Path(sys.argv[1])
forced_host = sys.argv[2].strip()
key = sys.argv[3].strip()
allow_mixed = sys.argv[4] == "1"
dry_run = sys.argv[5] in {"1", "true", "TRUE", "yes", "YES"}
endpoint = sys.argv[6].strip() or "https://api.indexnow.org/indexnow"
report_path = pathlib.Path(sys.argv[7])
label = sys.argv[8]
source_file = sys.argv[9]

urls = []
for line in url_file.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line:
        continue
    p = urllib.parse.urlparse(line)
    if p.scheme not in ("http", "https") or not p.netloc:
        raise SystemExit(f"ERROR: invalid URL in file: {line}")
    urls.append(line)

if not urls:
    raise SystemExit("ERROR: no URLs found to submit")

by_host = {}
for u in urls:
    host = urllib.parse.urlparse(u).netloc
    by_host.setdefault(host, []).append(u)

if forced_host:
    for host in by_host:
        if host != forced_host and not allow_mixed:
            raise SystemExit(f"ERROR: file contains mixed hosts ({', '.join(sorted(by_host))}); rerun with --allow-mixed or split files")
elif len(by_host) > 1 and not allow_mixed:
    raise SystemExit(f"ERROR: file contains mixed hosts ({', '.join(sorted(by_host))}); rerun with --allow-mixed or split files")

root = pathlib.Path.cwd()
config_key_file = None
config_key = None
cfg_path = root / "distribution.config.json"
if cfg_path.exists():
    try:
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        config_key_file = (cfg.get("indexnow") or {}).get("key_file")
        config_key = (cfg.get("indexnow") or {}).get("key")
    except Exception:
        config_key_file = None

verification = {"checked": False, "ok": False, "path": None, "expected": None, "actual": None}
if config_key_file:
    key_path = root / config_key_file
    verification.update({"checked": True, "path": config_key_file, "expected": key})
    if key_path.exists():
        actual = key_path.read_text(encoding="utf-8").strip()
        verification["actual"] = actual
        verification["ok"] = actual == key
    else:
        verification["actual"] = "missing"
else:
    candidate = root / f"{key}.txt"
    verification.update({"checked": True, "path": candidate.name, "expected": key})
    if candidate.exists():
        actual = candidate.read_text(encoding="utf-8").strip()
        verification["actual"] = actual
        verification["ok"] = actual == key
    else:
        verification["actual"] = "missing"

if not verification["ok"] and not dry_run:
    raise SystemExit(f"ERROR: IndexNow key verification file mismatch/missing: {verification['path']}")

chunk_size = 100
if cfg_path.exists():
    try:
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        chunk_size = int((cfg.get("indexnow") or {}).get("chunk_size") or 100)
    except Exception:
        chunk_size = 100
chunk_size = max(1, chunk_size)

attempts = []
failures = []
submitted = 0

def chunks(xs, n):
    for i in range(0, len(xs), n):
        yield xs[i:i+n]

def submit(host, host_urls):
    global submitted
    for idx, chunk in enumerate(chunks(host_urls, chunk_size), start=1):
        attempt = {"host": host, "count": len(chunk), "chunk": idx, "dryRun": dry_run, "statusCode": None, "ok": False}
        if dry_run:
            attempt["ok"] = True
            attempts.append(attempt)
            submitted += len(chunk)
            continue
        payload = {"host": host, "key": key, "urlList": chunk}
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(endpoint, data=body, headers={"Content-Type":"application/json; charset=utf-8"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                attempt["statusCode"] = resp.status
                attempt["response"] = resp.read().decode("utf-8", errors="replace")[:500]
                attempt["ok"] = 200 <= resp.status < 300
                if attempt["ok"]:
                    submitted += len(chunk)
                else:
                    failures.append(f"IndexNow returned status {resp.status} for host {host}")
        except Exception as exc:
            attempt["error"] = str(exc)
            failures.append(str(exc))
        attempts.append(attempt)

for host in sorted(by_host):
    submit(host, by_host[host])

status = "dry-run" if dry_run else ("success" if not failures else "partial")
run = {
    "label": label,
    "sourceFile": source_file,
    "submittedAt": datetime.datetime.now(datetime.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "endpoint": endpoint,
    "mode": "mixed-host" if len(by_host) > 1 else "single-host",
    "allowMixed": allow_mixed,
    "hosts": sorted(by_host),
    "urlCount": len(urls),
    "submittedCount": submitted,
    "status": status,
    "keyVerification": verification,
    "attempts": attempts,
    "failures": failures,
}

if report_path.exists():
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except Exception:
        report = {}
else:
    report = {}

runs = [r for r in report.get("runs", []) if r.get("label") != label]
runs.append(run)
all_failures = [f for r in runs for f in r.get("failures", [])]
report = {
    "repo": "sprylabs-hpc-site",
    "host": "mixed",
    "hosts": sorted({h for r in runs for h in r.get("hosts", [])}),
    "mode": "priority+batch" if {r.get("label") for r in runs} >= {"priority", "batch"} else label,
    "submittedAt": datetime.datetime.now(datetime.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "priorityCount": next((r.get("urlCount", 0) for r in runs if r.get("label") == "priority"), 0),
    "batchCount": next((r.get("urlCount", 0) for r in runs if r.get("label") == "batch"), 0),
    "endpoint": endpoint,
    "status": "dry-run" if any(r.get("status") == "dry-run" for r in runs) else ("success" if not all_failures else "partial"),
    "failures": all_failures,
    "runs": sorted(runs, key=lambda r: r.get("label", "")),
}
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(f"IndexNow {status}: label={label} urls={len(urls)} hosts={','.join(sorted(by_host))} report={report_path}")
if failures and not dry_run:
    raise SystemExit(1)
PY

rm -f "$tmp_clean"
