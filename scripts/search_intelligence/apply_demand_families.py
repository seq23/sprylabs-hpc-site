#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Strengthen each host's top measured demand families on their existing pages.

Input: data/search_intelligence/<host>/demand_families.json (one file per host,
built from Search Console query x page rows; every target is a measured query).
For each family marked strengthened, on its primary page (which must already
exist - this pass never creates a page):

  * <title>, og:title and twitter:title become the family's query-first title
    (<= 65 characters);
  * a section[data-demand-family] is seated under the H1 opening (after the
    opening definition paragraph and the recommendation-summary panel): a 40-60
    word definition, question H2s with direct answers, specific facts, and a
    CTA carrying a ref;
  * a visible FAQ (section.faq[data-demand-faq]) built from the real queries,
    and the page's ONE FAQPage node in CITATION_PAGE_SCHEMA synced to the
    visible FAQ through the repo's single definition (extraction_contract.
    visible_faq_pairs) and serializer, so rendered-schema parity holds by
    construction. The page-sections FAQ block build:visible-faq wrote is
    removed on these pages so the page carries one FAQ built from real queries.

The homepage gets one section[data-demand-hub] linking every strengthened page.

Idempotent and the LAST writer of these regions in build:all and
release:content-finalize: a second run is byte-identical. A
recommendation-summary panel another pass seats inside the section is moved in
front of it rather than deleted. Protected buyer pages are refused.
Guarded by scripts/validators/validate_demand_families.mjs.

Usage: apply_demand_families.py [--apply] [--root DIR]
"""
from __future__ import annotations

import hashlib
import html as htmllib
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
SCRIPTS = Path(__file__).resolve().parents[1]
for sub in ("_vendor", "citation", "lib", "content"):
    p = SCRIPTS / sub
    if p.is_dir():
        sys.path.insert(0, str(p))

from bs4 import BeautifulSoup  # noqa: E402
from extraction_contract import visible_faq_pairs  # noqa: E402
# CITATION_PAGE_SCHEMA is written only through the one serializer: upsert_faq_schema
# re-emits the block with citation_page_schema.serialize_schema, and the page's
# mainEntityOfPage is left exactly as main_entity_of_page() wrote it.
from citation_page_schema import serialize_schema, main_entity_of_page  # noqa: E402,F401
from build_visible_faq_sections import upsert_faq_schema, BLOCK_RE as PAGE_SECTIONS_FAQ_RE, py_json  # noqa: E402

ARGS = sys.argv[1:]
APPLY = "--apply" in ARGS
ROOT = Path(ARGS[ARGS.index("--root") + 1]).resolve() if "--root" in ARGS else SCRIPTS.parent
HOSTS = list(json.loads((ROOT / "config/site_hosts.json").read_text(encoding="utf-8"))["hosts"].keys())
PROTECTED = set(json.loads((ROOT / "data/page_contracts/protected_buyer_pages.json").read_text(encoding="utf-8"))["pages"])
HOMEPAGE = "index.html"

SECTION_RE = re.compile(r'<section\b[^>]*\bdata-demand-family="[^"]*"[^>]*>.*?</section>', re.S)
FAQ_RE = re.compile(r'<section\b[^>]*\bdata-demand-faq="[^"]*"[^>]*>.*?</section>', re.S)
HUB_RE = re.compile(r'<section\b[^>]*\bdata-demand-hub="true"[^>]*>.*?</section>', re.S)
PANEL_RE = re.compile(r'<div class="[^"]*recommendation-summary[^"]*"[^>]*>(?:(?!<div\b)[\s\S])*?</div>', re.I)
OPENING_RE = re.compile(r'^[\s\S]{0,400}?<p class="(?:citation-definition|answer-first)"[\s\S]*?</p>', re.I)

# Text is escaped the way the later BeautifulSoup passes re-serialize it (& < >
# only), attributes additionally escape the double quote, so no later pass in
# the build rewrites these bytes and the tree stays at its fixed point.
esc = lambda s: htmllib.escape(str(s), quote=False)
attr = lambda s: htmllib.escape(str(s), quote=False).replace('"', "&quot;")


def _sorted(value):
    if isinstance(value, dict):
        return {k: _sorted(value[k]) for k in sorted(value)}
    if isinstance(value, list):
        return [_sorted(v) for v in value]
    return value


def content_hash(content: dict) -> str:
    """sha256 of the key-sorted content in the one serializer's form (16 hex)."""
    return hashlib.sha256(serialize_schema(_sorted(content)).encode("utf-8")).hexdigest()[:16]


def definition_html(term: str, definition: str) -> str:
    if definition.lower().startswith(term.lower()):
        return f"<strong>{esc(definition[:len(term)])}</strong>{esc(definition[len(term):])}"
    return f"<strong>{esc(term)}:</strong> {esc(definition)}"


def render_section(fid: str, c: dict) -> str:
    qs = "".join(f"<h2>{esc(s['question'])}</h2><p>{esc(s['answer'])}</p>" for s in c["question_sections"])
    facts = "".join(f"<li>{esc(f)}</li>" for f in c["facts"])
    return (f'<section class="card demand-answer" data-demand-family="{attr(fid)}" data-demand-hash="{content_hash(c)}" id="demand-{attr(fid)}">'
            f'<p class="demand-definition">{definition_html(c["definition_term"], c["definition"])}</p>'
            f'{qs}<h3>Key facts</h3><ul class="demand-facts">{facts}</ul>'
            f'<p class="demand-cta"><a class="btn" href="{attr(c["cta"]["href"])}">{esc(c["cta"]["text"])}</a></p></section>')


def render_faq(fid: str, c: dict) -> str:
    body = "".join(f"<h3>{esc(q['question'])}</h3><p>{esc(q['answer'])}</p>" for q in c["faq"])
    return (f'<section class="card faq" data-visible-faq="true" data-demand-faq="{attr(fid)}" id="demand-faq">'
            f'<h2>Frequently asked questions</h2>{body}</section>')


def set_title(html: str, title: str) -> str:
    t = attr(title)
    html = re.sub(r"<title>.*?</title>", lambda _: f"<title>{t}</title>", html, count=1, flags=re.S)
    for key in ('property="og:title"', 'name="twitter:title"'):
        html = re.sub(r'<meta content="[^"]*" ' + re.escape(key), lambda _: f'<meta content="{t}" {key}', html)
        html = re.sub(r'<meta ' + re.escape(key) + r' content="[^"]*"', lambda _: f'<meta {key} content="{t}"', html)
    return html


def seat_section(html: str, section: str) -> str | None:
    # Take the old section out; any summary panel another pass seated inside it
    # goes back where the section stood, so nothing is lost and order is fixed.
    m = SECTION_RE.search(html)
    if m:
        inner_panels = "".join(PANEL_RE.findall(m.group(0)))
        html = html[:m.start()] + inner_panels + html[m.end():]
    h1 = html.find("</h1>")
    if h1 < 0:
        return None
    at = h1 + len("</h1>")
    opening = OPENING_RE.match(html[at:])
    if opening:
        at += opening.end()
    nxt = re.match(r"\s*", html[at:]).end()
    panel = PANEL_RE.match(html[at + nxt:])
    if panel:
        at += nxt + panel.end()
    return html[:at] + section + html[at:]


def seat_before_related(html: str, block: str, existing_re: re.Pattern) -> str:
    html = existing_re.sub("", html)
    nav = re.search(r'<section\b[^>]*data-internal-nav="related"[^>]*>', html, re.I)
    if nav:
        return html[:nav.start()] + block + html[nav.start():]
    for closer in ("</main>", "</article>", "</body>"):
        i = html.lower().rfind(closer)
        if i >= 0:
            return html[:i] + block + html[i:]
    return html + block


def load_families():
    out = []
    for host in HOSTS:
        path = ROOT / "data/search_intelligence" / host / "demand_families.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        fams = [f for f in data["families"] if f.get("strengthened")]
        if not fams:
            raise SystemExit(f"[apply-demand-families] FAIL: {path} strengthens no family; refusing to exit 0 having done nothing")
        out += [(host, f) for f in fams]
    return out


def branded_titles(fams) -> dict:
    # The page <title> is the family's title as the one title policy brands it
    # for the page's own host (scripts/lib/branded_title_cli.cjs ->
    # search_snippet_bounds.cjs brandedTitle). Writing the bare title made this
    # pass and repair:dual-domain-metadata fight over the same <title>.
    import subprocess
    items = [{"file": f["primary_page"]["file"], "title": f["content"]["title"]} for _, f in fams]
    res = subprocess.run(["node", str(ROOT / "scripts/lib/branded_title_cli.cjs")], input=json.dumps(items),
                         cwd=str(ROOT), check=True, capture_output=True, text=True)
    out = json.loads(res.stdout)
    missing = [i["file"] for i in items if not out.get(i["file"])]
    if missing:
        raise SystemExit(f"[apply-demand-families] FAIL: no branded title for {missing}")
    return out


def main() -> int:
    if py_json is not serialize_schema:
        raise SystemExit("[apply-demand-families] FAIL: build_visible_faq_sections no longer serializes through citation_page_schema.serialize_schema")
    fams = load_families()
    changed, unchanged, hub = [], 0, []
    titles = branded_titles(fams)
    for host, fam in fams:
        rel = fam["primary_page"]["file"]
        if rel in PROTECTED:
            raise SystemExit(f"[apply-demand-families] FAIL: {fam['id']} targets protected buyer page {rel}")
        path = ROOT / rel
        if not path.exists():
            raise SystemExit(f"[apply-demand-families] FAIL: {host} {fam['id']}: primary page {rel} is missing; this pass never creates pages")
        c = fam["content"]
        before = path.read_text(encoding="utf-8")
        html = set_title(before, titles[rel])
        seated = seat_section(html, render_section(fam["id"], c))
        if seated is None:
            raise SystemExit(f"[apply-demand-families] FAIL: {rel} has no H1")
        html = PAGE_SECTIONS_FAQ_RE.sub("", seated)
        html = seat_before_related(html, render_faq(fam["id"], c), FAQ_RE)
        soup = BeautifulSoup(html, "lxml")
        canonical_tag = soup.select_one('link[rel="canonical"]')
        canonical = canonical_tag.get("href", "") if canonical_tag else ""
        synced = upsert_faq_schema(html, canonical, visible_faq_pairs(soup))
        if synced is None:
            raise SystemExit(f"[apply-demand-families] FAIL: {rel} has no parseable CITATION_PAGE_SCHEMA to carry the FAQPage")
        html = synced
        if html != before:
            changed.append(rel)
            if APPLY:
                path.write_text(html, encoding="utf-8")
        else:
            unchanged += 1
        href = "/" + re.sub(r"^https://[^/]+/", "", fam["primary_page"]["url"])
        hub.append((href, c["title"]))
    # Homepage: one hub linking every strengthened page.
    home = ROOT / HOMEPAGE
    before = home.read_text(encoding="utf-8")
    items = "".join(f'<li><a href="{attr(h)}">{esc(t)}</a></li>' for h, t in hub)
    block = (f'<section class="card" data-demand-hub="true" id="most-searched"><h2>Most-searched questions</h2>'
             f'<p>The questions people search for most on these sites, each answered on its own page.</p><ul>{items}</ul></section>')
    after = seat_before_related(before, block, HUB_RE)
    if after != before:
        changed.append(HOMEPAGE)
        if APPLY:
            home.write_text(after, encoding="utf-8")
    print(f"[apply-demand-families] {'APPLIED' if APPLY else 'dry run'}: {len(fams)} families on {len(hub)} pages; changed={len(changed)} unchanged={unchanged}; homepage hub links={len(hub)}")
    for rel in changed:
        print("  changed " + rel)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
