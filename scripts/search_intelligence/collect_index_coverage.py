#!/usr/bin/env python3
"""Daily index coverage for one host: data/search_intelligence/<host>/index_coverage.json.

Same file shape and rotation as authority-backlink-network's collect_gsc.py, which
the portfolio's weekly search-outcome report (local-guides-citation-velocity,
scripts/search_console/search_outcomes_weekly.py) already reads for its
"indexed share" column. Without this file the report printed "no coverage file"
for billionairehighperformancecoach.com and spryexecutiveos.com.

  urlInspection.index.inspect, 8 requests in parallel, at most 150 URLs per host
  per day (the quota is 2,000/day per property). Rotation: homepage, then
  never-inspected sitemap URLs in sitemap order, then the oldest inspection, so
  every sitemap URL is covered over time. Rows merge with the previous file and
  rows for URLs that left the sitemap are dropped.

The URL universe is the committed host sitemap (sitemap-bhpc.xml / sitemap-spry.xml),
which is what main deployed.

A run where every inspection fails leaves the previous file as it was and prints a
NAMED STOP line (exit 0): a bad day never blanks evidence. Exit 1 only on bad usage.

Usage: collect_index_coverage.py <service-account.json> <site-url> <host> <sitemap.xml>
Guard: scripts/search_intelligence/self_test_index_coverage.py (validate:search-measurement-truthfulness).
"""
from __future__ import annotations

import concurrent.futures as cf
import datetime as dt
import json
import re
import socket
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CAP_PER_HOST = 150
PARALLEL = 8
ROTATION = "homepage, then never-inspected sitemap URLs in sitemap order, then oldest inspection first"


def sitemap_urls(xml_text: str, host: str) -> list[str]:
    urls = [u.strip() for u in re.findall(r"<loc>\s*([^<]+?)\s*</loc>", xml_text)]
    return [u for u in dict.fromkeys(urls) if re.match(rf"^https://(www\.)?{re.escape(host)}(/|$)", u)]


def plan_batch(host: str, pages: list[str], prev: dict | None, cap: int = CAP_PER_HOST):
    """(universe, prev_rows, batch) - the rotation, with no network."""
    home = f"https://{host}/"
    universe = [home] + [u for u in pages if u.rstrip("/") != home.rstrip("/")]
    keep = set(universe)
    prev_rows = {r["url"]: r for r in (prev or {}).get("urls", []) if r.get("url") in keep}
    order = {u: i for i, u in enumerate(universe)}
    rest = sorted(universe[1:], key=lambda u: (u in prev_rows, (prev_rows.get(u) or {}).get("inspected_at") or "", order[u]))
    return universe, prev_rows, ([home] + rest)[:cap]


def bucket(idx: dict) -> str:
    state = (idx.get("coverageState") or "").lower()
    if "unknown to google" in state:
        return "unknown"
    if "crawled" in state and "not indexed" in state:
        return "crawled_not_indexed"
    if "discovered" in state and "not indexed" in state:
        return "discovered_not_indexed"
    if idx.get("verdict") == "PASS" or ("indexed" in state and "not indexed" not in state):
        return "indexed"
    return "other"


def row_from(url: str, idx: dict, now: str) -> dict:
    return {"url": url, "bucket": bucket(idx), "coverageState": idx.get("coverageState"), "verdict": idx.get("verdict"),
            "lastCrawlTime": idx.get("lastCrawlTime"), "pageFetchState": idx.get("pageFetchState"),
            "googleCanonical": idx.get("googleCanonical"), "userCanonical": idx.get("userCanonical"), "inspected_at": now}


def build_doc(host: str, site_url: str, universe: list[str], prev_rows: dict, fresh: list[dict], now: str) -> dict:
    ok = [r for r in fresh if r["bucket"] != "error"]
    rows_by_url = dict(prev_rows)
    for r in ok:
        rows_by_url[r["url"]] = r
    rows = [rows_by_url[u] for u in universe if u in rows_by_url]
    by_state: dict[str, int] = {}
    buckets: dict[str, int] = {}
    for r in rows:
        k = r.get("coverageState") or r["bucket"]
        by_state[k] = by_state.get(k, 0) + 1
        buckets[r["bucket"]] = buckets.get(r["bucket"], 0) + 1
    return {"schema_version": "1.0", "truth_source": "google_search_console_url_inspection", "host": host,
            "site_url": site_url, "collected_at": now, "state": "OK" if ok else "NAMED_STOP",
            "named_stop": None if ok else f"URL Inspection failed for all {len(fresh)} URLs: {fresh[0].get('error') if fresh else 'no URLs'}",
            "sitemap_url_count": len(universe), "inspected_this_run": len(ok), "errors_this_run": len(fresh) - len(ok),
            "inspected_total": len(rows), "never_inspected": len(universe) - len(rows),
            "quota": {"daily_limit_per_property": 2000, "cap_per_host_per_day": CAP_PER_HOST, "parallel": PARALLEL},
            "rotation": ROTATION,
            "summary": {"by_coverage_state": dict(sorted(by_state.items())), "buckets": dict(sorted(buckets.items()))},
            "truth_boundary": "URL Inspection reports Google's index state per URL at inspected_at; impressions come from gsc_truth.json.",
            "urls": rows}


def main() -> int:
    if len(sys.argv) != 5:
        print("usage: collect_index_coverage.py <service-account.json> <site-url> <host> <sitemap.xml>", file=sys.stderr)
        return 1
    cred, site_url, host, sitemap = sys.argv[1:]
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    socket.setdefaulttimeout(60)
    creds = service_account.Credentials.from_service_account_file(
        cred, scopes=["https://www.googleapis.com/auth/webmasters.readonly"])
    local = threading.local()  # googleapiclient service objects are not thread-safe

    def svc():
        if not hasattr(local, "svc"):
            local.svc = build("searchconsole", "v1", credentials=creds, cache_discovery=False)
        return local.svc

    out = ROOT / "data" / "search_intelligence" / host / "index_coverage.json"
    prev = json.loads(out.read_text(encoding="utf-8")) if out.exists() else None
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    pages = sitemap_urls((ROOT / sitemap).read_text(encoding="utf-8"), host)
    universe, prev_rows, batch = plan_batch(host, pages, prev)

    def inspect(url: str) -> dict:
        try:
            resp = svc().urlInspection().index().inspect(
                body={"inspectionUrl": url, "siteUrl": site_url, "languageCode": "en-US"}).execute()
            return row_from(url, (resp.get("inspectionResult") or {}).get("indexStatusResult") or {}, now)
        except Exception as exc:  # noqa: BLE001 - every failure is counted, none swallowed
            return {"url": url, "bucket": "error", "error": str(exc)[:300]}

    with cf.ThreadPoolExecutor(PARALLEL) as pool:
        fresh = list(pool.map(inspect, batch))
    doc = build_doc(host, site_url, universe, prev_rows, fresh, now)
    if doc["state"] != "OK":
        print(f"NAMED STOP: index coverage {host}: {doc['named_stop']}; {out.relative_to(ROOT)} left as it was.")
        return 0
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    b = doc["summary"]["buckets"]
    print(f"index coverage {host}: inspected {doc['inspected_this_run']} (errors {doc['errors_this_run']}), "
          f"{doc['inspected_total']}/{doc['sitemap_url_count']} known, indexed={b.get('indexed', 0)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
