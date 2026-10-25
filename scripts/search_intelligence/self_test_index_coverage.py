#!/usr/bin/env python3
"""Guard for collect_index_coverage.py, no network.

Proves the rotation (homepage first, never-inspected next in sitemap order, then
oldest), the 150 cap, that rows for URLs that left the sitemap drop, that an
all-error run is a NAMED_STOP, and that the file shape is the one the weekly
search-outcome report reads (site_url names the host; summary.by_coverage_state
counts give the indexed share).
"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # validate:release-portability rejects __pycache__
sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect_index_coverage import CAP_PER_HOST, build_doc, plan_batch, row_from, sitemap_urls  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
errors = []
H = "spryexecutiveos.com"
xml = "".join(f"<url><loc>https://{H}/p{i}</loc></url>" for i in range(200)) + "<url><loc>https://other.example/x</loc></url>"
pages = sitemap_urls(xml, H)
if len(pages) != 200:
    errors.append(f"sitemap_urls must keep only the host's URLs, got {len(pages)}")
prev = {"urls": [{"url": f"https://{H}/p0", "bucket": "indexed", "inspected_at": "2026-10-01T00:00:00+00:00"},
                 {"url": f"https://{H}/gone", "bucket": "indexed", "inspected_at": "2026-10-01T00:00:00+00:00"}]}
universe, prev_rows, batch = plan_batch(H, pages, prev)
if batch[0] != f"https://{H}/" or len(batch) != CAP_PER_HOST or CAP_PER_HOST != 150:
    errors.append("batch must start at the homepage and stop at 150")
if batch[1] != f"https://{H}/p1" or f"https://{H}/p0" in batch:
    errors.append("never-inspected URLs must come before already-inspected ones, in sitemap order")
if f"https://{H}/gone" in prev_rows:
    errors.append("a URL that left the sitemap must drop")
fresh = [row_from(u, {"coverageState": "Submitted and indexed", "verdict": "PASS"}, "2026-10-25T00:00:00+00:00") for u in batch[:3]]
fresh.append(row_from(batch[3], {"coverageState": "Crawled - currently not indexed", "verdict": "NEUTRAL"}, "2026-10-25T00:00:00+00:00"))
fresh.append({"url": batch[4], "bucket": "error", "error": "timeout"})
doc = build_doc(H, f"sc-domain:{H}", universe, prev_rows, fresh, "2026-10-25T00:00:00+00:00")
if doc["state"] != "OK" or doc["inspected_this_run"] != 4 or doc["errors_this_run"] != 1 or doc["inspected_total"] != 5:
    errors.append(f"counts wrong: {doc['state']} {doc['inspected_this_run']} {doc['errors_this_run']} {doc['inspected_total']}")
if doc["summary"]["buckets"] != {"crawled_not_indexed": 1, "indexed": 4}:
    errors.append(f"buckets wrong: {doc['summary']['buckets']}")
bad = build_doc(H, f"sc-domain:{H}", universe, prev_rows, [{"url": batch[0], "bucket": "error", "error": "403"}], "t")
if bad["state"] != "NAMED_STOP" or "403" not in (bad["named_stop"] or ""):
    errors.append("an all-error run must be a NAMED_STOP naming the error")

# The weekly report's own reader (local-guides-citation-velocity) takes the host from
# site_url and the share from summary.by_coverage_state; mirror its rule here.
counts = doc["summary"]["by_coverage_state"]
share = sum(v for k, v in counts.items() if "indexed" in k.lower() and "not indexed" not in k.lower()) / sum(counts.values())
if not doc["site_url"].endswith(H) or round(share, 2) != 0.8:
    errors.append(f"shape not readable by the weekly report: site_url={doc['site_url']} share={share}")

# The daily cycle must actually invoke the collector for both hosts (no inert script).
cycle = (ROOT / ".github/scripts/run_search_intelligence_cycle.sh").read_text(encoding="utf-8")
for host, sm in (("billionairehighperformancecoach.com", "sitemap-bhpc.xml"), ("spryexecutiveos.com", "sitemap-spry.xml")):
    if f"collect_index_coverage.py .gsc-service-account.json" not in cycle or f"{host} {sm}" not in cycle:
        errors.append(f"run_search_intelligence_cycle.sh does not collect index coverage for {host}")

if errors:
    print("[search:index-coverage:self-test] FAIL\n- " + "\n- ".join(errors), file=sys.stderr)
    sys.exit(1)
print("[search:index-coverage:self-test] PASS")
