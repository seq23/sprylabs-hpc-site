#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pin a small set of pages to the Spry origin without undoing the route migration.

This repair exists to fix the *domain* of four canonicals, not their path. It
used to carry the full URL as a hand-written literal, and three of those
literals still had the pre-migration ``.html`` form. Because it runs inside
repair:citation-contract-surfaces - after build:all had already written the
clean route - every build silently rewrote those canonicals back to a URL that
301s, and repair_schema_parity.py then copied the redirecting form into the
page schema.

The path now comes from scripts/lib/route_policy.py, the single definition of
which form answers 200, so this script cannot drift out of the migration again.
"""
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from route_policy import route_for  # noqa: E402

ROOT = Path.cwd()
SPRY_ORIGIN = "https://spryexecutiveos.com"
# Pages whose canonical origin must be Spry rather than the BHPC product domain.
SPRY_CANONICAL_PATHS = [
    "ai-executive-coach/index.html",
    "ai-executive-coach-alternative-for-high-performers.html",
    "how-to-stay-consistent-when-motivation-is-low.html",
    "how-tracks-work.html",
]

changed = 0
for rel in SPRY_CANONICAL_PATHS:
    fp = ROOT / rel
    if not fp.exists():
        continue
    url = SPRY_ORIGIN + route_for(rel)
    html = fp.read_text(encoding="utf-8", errors="ignore")
    old = html
    html = re.sub(r'<link([^>]*rel=["\']canonical["\'][^>]*href=)["\'][^"\']*["\']', lambda m: m.group(0).split('href=')[0] + 'href="' + url + '"', html, flags=re.I)
    html = re.sub(r'<link([^>]*href=)["\'][^"\']*["\']([^>]*rel=["\']canonical["\'][^>]*)>', lambda m: '<link' + m.group(1) + '"' + url + '"' + m.group(2) + '>', html, flags=re.I)
    html = re.sub(r'<meta([^>]*property=["\']og:url["\'][^>]*content=)["\'][^"\']*["\']', lambda m: m.group(0).split('content=')[0] + 'content="' + url + '"', html, flags=re.I)
    html = re.sub(r'<meta([^>]*content=)["\'][^"\']*["\']([^>]*property=["\']og:url["\'][^>]*)>', lambda m: '<meta' + m.group(1) + '"' + url + '"' + m.group(2) + '>', html, flags=re.I)
    if html != old:
        fp.write_text(html, encoding="utf-8")
        changed += 1
print(f'repair_dual_domain_contract: changed={changed}')
