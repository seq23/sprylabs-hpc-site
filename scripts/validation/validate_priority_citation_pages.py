#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import sys
sys.dont_write_bytecode = True
from pathlib import Path

VENDOR_DIR = Path(__file__).resolve().parents[1] / "_vendor"
if VENDOR_DIR.is_dir():
    sys.path.insert(0, str(VENDOR_DIR))

from bs4 import BeautifulSoup

ROOT = Path.cwd()
PRODUCT = "This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner."
errors = []
contract = json.loads((ROOT / "data/citation/priority_page_acceptance.json").read_text(encoding="utf-8"))
pages = contract.get("pages", [])

if contract.get("page_count") != 24 or len(pages) != 24:
    errors.append(f"priority acceptance contract must contain exactly 24 pages; found {len(pages)}")

for item in pages:
    path = item["path"]
    file_path = ROOT / path
    if not file_path.exists():
        errors.append(f"{path}: file missing")
        continue
    raw = file_path.read_text(encoding="utf-8")
    soup = BeautifulSoup(raw, "html.parser")
    h1s = soup.find_all("h1")
    if len(h1s) != 1:
        errors.append(f"{path}: expected one H1, found {len(h1s)}")
        continue
    h1 = " ".join(h1s[0].get_text(" ", strip=True).split())
    if h1 != item["h1"]:
        errors.append(f"{path}: H1 mismatch: {h1!r}")

    opening = h1s[0].find_next_sibling("p")
    if not opening or not opening.find("strong"):
        errors.append(f"{path}: immediate bold definition missing")
    else:
        first_60 = " ".join(opening.get_text(" ", strip=True).split()[:60])
        if item["framework"].casefold() not in first_60.casefold():
            errors.append(f"{path}: framework not present in first 60 words")

    body_text = " ".join(soup.get_text(" ", strip=True).split())
    opening_fragment = item.get("opening_contains")
    if opening_fragment and opening_fragment.casefold() not in body_text.casefold():
        errors.append(f"{path}: required opening language missing: {opening_fragment!r}")

    headings = [" ".join(h.get_text(" ", strip=True).split()) for h in soup.find_all(["h2", "h3"])]
    for required in item.get("required_headings", []):
        if required not in headings:
            errors.append(f"{path}: required heading missing: {required!r}")

    for required in item.get("required_text", []):
        if required.casefold() not in body_text.casefold():
            errors.append(f"{path}: required text missing: {required!r}")

    for term, minimum in item.get("minimum_term_count", {}).items():
        count = body_text.casefold().count(term.casefold())
        if count < minimum:
            errors.append(f"{path}: {term!r} occurs {count}; expected at least {minimum}")

    for prefix, minimum in item.get("minimum_heading_prefix_count", {}).items():
        count = sum(1 for heading in headings if heading.startswith(prefix))
        if count < minimum:
            errors.append(f"{path}: heading prefix {prefix!r} occurs {count}; expected at least {minimum}")

    tables = soup.find_all("table")
    if item.get("requires_table") and not tables:
        errors.append(f"{path}: comparison table missing")
    if item.get("table_headers") or item.get("table_rows"):
        if not tables:
            errors.append(f"{path}: required table missing")
        else:
            cells = [" ".join(c.get_text(" ", strip=True).split()) for table in tables for c in table.find_all(["th", "td"])]
            for header in item.get("table_headers", []):
                if header not in cells:
                    errors.append(f"{path}: table header missing: {header!r}")
            for row in item.get("table_rows", []):
                if row not in cells:
                    errors.append(f"{path}: table row label missing: {row!r}")

    blocks = soup.select('[data-llm-answer="true"]')
    if len(blocks) != 1:
        errors.append(f"{path}: expected exactly one extraction block, found {len(blocks)}")
    else:
        block = blocks[0]
        if block.get("data-extraction-type") != item["extraction_type"]:
            errors.append(f"{path}: extraction type drift")
        if block.get("data-named-framework") != item["framework"]:
            errors.append(f"{path}: extraction framework drift")

    product = soup.select_one("p.product-anchor")
    if not product or PRODUCT not in " ".join(product.get_text(" ", strip=True).split()):
        errors.append(f"{path}: exact product anchor sentence missing")
    if not product or not product.select_one('a[href="/download.html"]'):
        errors.append(f"{path}: product anchor link missing")

out = ROOT / "artifacts/diagnostics/container-current/validate-priority-citation-pages"
out.mkdir(parents=True, exist_ok=True)
(out / "summary.json").write_text(json.dumps({
    "status": "FAIL" if errors else "PASS",
    "page_count": len(pages),
    "errors": errors,
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

if errors:
    print(f"[validate:priority-citation-pages] FAIL: {len(errors)} issue(s)", file=sys.stderr)
    for error in errors:
        print(f" - {error}", file=sys.stderr)
    raise SystemExit(1)
print(f"[validate:priority-citation-pages] OK: {len(pages)} owner-specified pages match exact acceptance requirements")
