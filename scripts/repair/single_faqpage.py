#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""One FAQPage per page.

On 11 Oct 2026 32 pages (the homepage among them) carried two or three FAQPage
nodes: the CITATION_PAGE_SCHEMA graph's node, which validate:rendered-schema-
parity holds equal to the visible FAQ, plus legacy standalone ld+json blocks
repeating or diverging from it. Search engines treat several FAQPage items on
one URL as an error, and the divergent copies described questions the page no
longer shows.

Rule: keep CITATION_PAGE_SCHEMA's FAQPage when it has one (it is the copy held
to the visible FAQ); otherwise keep the first FAQPage found. Remove every other
FAQPage node; a script left with nothing is removed. Nothing else in any schema
block changes. Runs after every FAQ writer in build:all.
Guarded by scripts/validators/validate_demand_families.mjs (site-wide count).

Usage: single_faqpage.py [--apply] [--root DIR] [files...]
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS / "lib"))
from citation_page_schema import serialize_schema  # noqa: E402
from repo_walk import is_ignored_dir  # noqa: E402  (the shared walk boundary: never descends into .claude/ worktrees)

ARGS = sys.argv[1:]
APPLY = "--apply" in ARGS
ROOT = Path(ARGS[ARGS.index("--root") + 1]).resolve() if "--root" in ARGS else SCRIPTS.parent
FILES = [a for i, a in enumerate(ARGS) if not a.startswith("--") and (i == 0 or ARGS[i - 1] != "--root")]
SKIP = re.compile(r"^(node_modules|\.git|\.claude|\.pages-output|\.build|artifacts|data|reports|content|fixtures|test-results|templates|docs|scripts|functions|config)(/|$)")
SCRIPT_RE = re.compile(r'<script(?P<attrs>[^>]*)type="application/ld\+json"(?P<attrs2>[^>]*)>(?P<body>.*?)</script>', re.S)
FAQ_COUNT_RE = re.compile(r'"@type"\s*:\s*"FAQPage"')
# Never written: the protected buyer pages and the directories that are not
# pages of the shared sites (the one lists, read here rather than copied).
PROTECTED = set(json.loads((ROOT / "data/page_contracts/protected_buyer_pages.json").read_text(encoding="utf-8"))["pages"])
EXCLUDED_DIRS = set(json.loads((ROOT / "config/index_exclusions.json").read_text(encoding="utf-8"))["dirs"])


def is_faq(n) -> bool:
    return isinstance(n, dict) and n.get("@type") == "FAQPage"


def fix(html: str) -> tuple[str, int]:
    if len(FAQ_COUNT_RE.findall(html)) < 2:
        return html, 0
    blocks = []
    for m in SCRIPT_RE.finditer(html):
        try:
            data = json.loads(m.group("body"))
        except Exception:
            continue
        cit = 'id="CITATION_PAGE_SCHEMA"' in (m.group("attrs") + m.group("attrs2"))
        blocks.append((m, data, cit))

    def faq_nodes(data):
        if isinstance(data, dict) and isinstance(data.get("@graph"), list):
            return [n for n in data["@graph"] if is_faq(n)]
        if isinstance(data, list):
            return [n for n in data if is_faq(n)]
        return [data] if is_faq(data) else []

    keeper = next((i for i, (_, d, c) in enumerate(blocks) if c and faq_nodes(d)), None)
    if keeper is None:
        keeper = next((i for i, (_, d, _) in enumerate(blocks) if faq_nodes(d)), None)
    if keeper is None:
        return html, 0
    removed = 0
    out, last = [], 0
    for i, (m, data, _) in enumerate(blocks):
        nodes = faq_nodes(data)
        drop = nodes if i != keeper else nodes[1:]
        if not drop:
            continue
        removed += len(drop)
        if isinstance(data, dict) and isinstance(data.get("@graph"), list):
            data["@graph"] = [n for n in data["@graph"] if not any(n is d for d in drop)]
            replacement = None if not data["@graph"] else data
        elif isinstance(data, list):
            data = [n for n in data if not any(n is d for d in drop)]
            replacement = data or None
        else:
            replacement = None
        out.append(html[last:m.start()])
        if replacement is not None:
            out.append(f'<script{m.group("attrs")}type="application/ld+json"{m.group("attrs2")}>{serialize_schema(replacement)}</script>')
        last = m.end()
    out.append(html[last:])
    return "".join(out), removed


def pages():
    if FILES:
        return [ROOT / f for f in FILES]
    found = []
    for dp, dn, fn in os.walk(ROOT):
        rel = os.path.relpath(dp, ROOT)
        rel = "" if rel == "." else rel
        if rel and (SKIP.search(rel) or is_ignored_dir(os.path.basename(rel), rel)):
            dn[:] = []
            continue
        dn[:] = [d for d in dn if not is_ignored_dir(d, f"{rel}/{d}" if rel else d)]
        found += [Path(dp) / f for f in fn if f.endswith(".html")]
    return sorted(found)


def main() -> int:
    fixed = nodes = scanned = 0
    for p in pages():
        rel = p.relative_to(ROOT).as_posix()
        if rel in PROTECTED or rel.split("/")[0] in EXCLUDED_DIRS:
            continue
        scanned += 1
        html = p.read_text(encoding="utf-8")
        out, removed = fix(html)
        if removed:
            fixed += 1
            nodes += removed
            if APPLY:
                p.write_text(out, encoding="utf-8")
    if scanned == 0:
        raise SystemExit("[single-faqpage] FAIL: scanned zero pages")
    print(f"[single-faqpage] {'APPLIED' if APPLY else 'dry run'}: scanned={scanned} pages_fixed={fixed} faqpage_nodes_removed={nodes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
