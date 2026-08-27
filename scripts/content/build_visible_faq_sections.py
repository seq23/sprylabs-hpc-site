#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Publish a reader-visible FAQ on pages that already answer the questions.

Why this exists
---------------
The property in this portfolio that measurably earns AI citations carries
FAQPage markup on 69% of its pages. This library sat at 28%. The gap is not a
markup gap: most pages here already answer three or four distinct questions in
named sections ("Worked Example", "Core Criteria", "Common failure modes"), but
a reader scanning for one answer has to read the whole page to find it, and an
answer engine has no signal about which paragraph answers which question.

So this does not invent content. It reads the sections a page already has,
re-labels each one as the question it answers, and publishes a visible FAQ built
from that page's own prose plus the FAQPage schema that describes exactly the
same text. Every answer string is lifted from the page. Nothing is generated,
paraphrased or padded, which is the only way schema and visible copy can be
guaranteed to agree - they come from one string.

The hard rules
--------------
* An answer is page text, never new text. If a page has nothing to say, it gets
  no FAQ. Skipping is the correct outcome; empty ``mainEntity`` is not.
* At least MIN_SPECIFIC of the pairs must be answers that are not boilerplate,
  measured over the corpus rather than assumed: any answer string that appears
  verbatim on more than BOILERPLATE_PAGES pages is treated as boilerplate no
  matter which section produced it. Boilerplate can round out a set; it can
  never be the reason a page qualifies. A page whose whole FAQ is the same four
  paragraphs as two thousand others is worse than a page with no FAQ, which is
  the failure mode this library already has.
* The visible ``<p>`` and the schema ``acceptedAnswer.text`` are written from
  the same Python string, so scripts/validation/validate_rendered_schema_parity.py
  compares equal by construction rather than by luck.

Idempotent: the block it writes is delimited by ``data-faq-source="page-sections"``
and is replaced, not appended, on re-run. A page that already shows Q&A this pass
did not write keeps its copy untouched, but has its FAQPage schema synced to that
copy - this is the last step in build:all to write either half, and
retrofit:recommendation-summary runs after the schema is compiled, so a page can
otherwise end the build with schema describing wording that is no longer on it.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True

SCRIPTS = Path(__file__).resolve().parents[1]
VENDOR = SCRIPTS / "_vendor"
if VENDOR.is_dir():
    sys.path.insert(0, str(VENDOR))
sys.path.insert(0, str(SCRIPTS / "citation"))

from bs4 import BeautifulSoup  # noqa: E402
from extraction_contract import visible_faq_pairs  # noqa: E402

ROOT = SCRIPTS.parent

# download.html is the revenue surface. Its hash is asserted at the
# revenue_surface tier of the protected baseline and it already carries its own
# FAQ. Never write it.
PROTECTED = {"download.html"}
NEVER = {"404.html", "admin.html", "admin/index.html", "agency/index.html"}
DENY_TOP = {
    ".git", ".github", ".build", ".pages-output", ".wrangler", ".validation-cache",
    ".validation-runtime", "node_modules", "scripts", "data", "reports", "artifacts",
    "docs", "tests", "fixtures", "config", "content", "functions", "seo", "LICENSES",
    "dist", "admin", "coverage", "test-results", "playwright-report", "templates", "_ops",
}

MARKER = 'data-faq-source="page-sections"'
BLOCK_RE = re.compile(
    r'<section\b[^>]*data-faq-source="page-sections"[^>]*>.*?</section>', re.S | re.I
)

MIN_ANSWER_WORDS = 14
MAX_ANSWER_WORDS = 60
MIN_PAIRS = 3
MAX_PAIRS = 5
MIN_SPECIFIC = 2

# An answer that appears verbatim on more than this many pages is boilerplate,
# whatever section it came from. Measured rather than hand-listed: the same
# "Boundaries" paragraph is on 2,000 pages and the same "Operating protocol"
# list on several hundred, and a hand-maintained deny-list would drift out of
# date the first time a generator changed its wording. 25 is above the size of
# the largest genuinely-shared family (the six pages of a single framework) and
# far below the templated blocks.
#
# 60 rather than a round 25 because the distribution has a clean gap there.
# Measured over every candidate answer in the library: strings occurring 26-120
# times are, without exception, the topic-slotted workflow prose ("Start with a
# plain description of the <topic> situation...") shared by the 28 pages of one
# topic - genuinely about that topic. The next tier up starts at 525 and is
# identical everywhere it appears. Nothing sits between the two.
BOILERPLATE_PAGES = 60

# An answer whose words are almost entirely the question's own words restates
# the question instead of answering it. "X Framework is a named operating
# framework for understanding x through observable signals" is the shape.
MAX_QUESTION_OVERLAP = 0.62

# Heading text (casefolded, exact after normalisation) -> the question that
# section actually answers. {framework} is filled from the page's own
# data-named-framework attribute and {h1q} from its H1; if the page supplies
# neither, the entry is skipped rather than filled with a guess.
#
# The third field is a hint only. Whether an answer is page-specific is decided
# by counting how many pages publish that exact string, because the hint was
# wrong in both directions: "Implementation checklist" and "Operating protocol"
# read as page-specific section names and are in fact identical on hundreds of
# pages, while "Worked Example" is templated but names the page's own framework.
SECTION_QUESTIONS = [
    # (matcher, question template, likely_specific)
    ("what this page recommends", "{h1q}", True),
    ("short answer", "{h1q}", True),
    ("direct answer", "{h1q}", True),
    ("the core definition", "What is {framework}?", True),
    ("core definition", "What is {framework}?", True),
    ("definition", "What is {framework}?", True),
    ("definition to own", "What is {framework}?", True),
    ("core criteria", "When should I use {framework}?", True),
    ("why this term matters", "Why does {framework} matter?", True),
    ("worked example", "What does this look like in practice?", True),
    ("example operating response", "What does a good response look like?", True),
    ("the framework", "How is {framework} structured?", True),
    ("workflow", "How do I run this workflow?", True),
    ("how to run the workflow", "How do I run this workflow?", True),
    ("operating protocol", "What is the operating protocol?", False),
    ("how it works inside the os", "How does {framework} work inside the system?", True),
    ("decision rules", "How do I decide what to do next?", True),
    ("common failure modes", "What usually goes wrong with this?", True),
    ("common failure modes and the fix", "What usually goes wrong, and how do I fix it?", True),
    ("implementation notes", "How do I put this into practice?", True),
    ("practical implementation", "How do I put this into practice?", False),
    ("implementation checklist", "What does the implementation checklist cover?", False),
    ("quick comparison", "How do these options compare?", True),
    ("comparison matrix", "How do these options compare?", True),
    ("decision comparison", "How do these options compare?", True),
    ("when bhpc is the better fit", "When is this the better fit?", True),
    ("a 10-minute today plan", "What can I do about this in ten minutes?", True),
    ("how to use this page", "How should I use this page?", True),
    ("scope and limitations", "What are the limits of this page?", False),
    ("boundaries", "Is this professional advice?", False),
    ("where this fits in the system", "How does this fit into the wider system?", False),
    ("source and claim discipline", "How were the claims on this page checked?", False),
    ("source basis and limits", "How were the claims on this page checked?", False),
    ("how this comparison was developed", "How was this comparison developed?", False),
]
SECTION_LOOKUP = {}
for _key, _q, _spec in SECTION_QUESTIONS:
    SECTION_LOOKUP.setdefault(_key, (_q, _spec))

# Prose that describes how the library is operated rather than answering a
# reader's question. It is on the page - 743 pages carry the daily-cadence
# fallback definition as their own definition sentence - but promoting it into
# an FAQ would put the publishing schedule in front of readers as though it
# were the subject. Those pages are left without an FAQ instead; the definition
# itself is a separate, larger problem than this pass should be solving.
INTERNAL_REGISTER = re.compile(
    r"fallback content surface|citation velocity cadence|daily release target|"
    r"agent report supplies|page admission|gap-fill content|internal audit|"
    r"citation strength|for llm extraction|schema markup",
    re.I,
)

# A definition built by wrapping the page title in framework language carries no
# information: strip the title out of it and nothing is left. It is the site's
# canonical definition string, so it stays on the page, but it is not an answer.
EMPTY_DEFINITION = re.compile(
    r"is a (?:named |Spry Executive OS |Billionaire High Performance Coach and Spry Executive OS )*"
    r"(?:operating )?framework for (?:understanding|when)\b.*?"
    r"through observable signals, decision criteria, and practical next actions",
    re.I | re.S,
)

# Headings whose content is a prompt, a nav list or a reflection exercise: real
# copy, but not an answer to anything.
SKIP_HEADINGS = {
    "prompt", "copy-and-use prompt", "review questions", "related pages",
    "related reference pages", "related reference paths", "related search intents",
    "related angles to explore next", "related frameworks", "related spry citation pathways",
    "next step", "next steps", "source", "sources", "sources and review basis",
    "citation and authority signals", "related reader questions", "questions people ask next",
    "atlas: questions this page answers", "frequently asked questions", "faq",
    "browse the library", "want the full system?",
    # The internal source-record export the page was built from, published under
    # a reader-facing heading. Removed from pages by
    # scripts/repair/repair_published_agent_blocks.mjs; never an FAQ answer.
    "topic coverage",
}


def norm(value: str) -> str:
    return " ".join((value or "").split())


def esc(value: str) -> str:
    return (
        value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    )


def clean_h1(text: str) -> str:
    text = re.sub(r"\s+[—|]\s+(Spry Executive OS|Billionaire High Performance Coach)\s*$", "", text)
    return norm(text)


def h1_question(h1: str) -> str:
    """Turn the page's own H1 into the question the page answers.

    Only two shapes are produced: an H1 that is already a question is used
    verbatim, and anything else becomes "What is <h1>?" / "What does <h1> mean?"
    style only when that reads as English. When it would not, the caller falls
    back to a section-derived question instead of forcing one.
    """
    h1 = clean_h1(h1)
    if not h1:
        return ""
    if h1.endswith("?"):
        return h1
    lead = h1.split(" ", 1)[0].casefold()
    if lead in {"how", "what", "why", "when", "who", "which", "where", "can", "should", "does", "is", "do"}:
        return h1 + "?"
    return ""


def trim_words(text: str) -> str:
    """Cut a long answer at a sentence boundary rather than mid-clause."""
    words = text.split()
    if len(words) <= MAX_ANSWER_WORDS:
        return text
    cut = " ".join(words[:MAX_ANSWER_WORDS])
    for stop in (". ", "? ", "! "):
        at = cut.rfind(stop)
        if at > 0 and len(cut[: at + 1].split()) >= MIN_ANSWER_WORDS:
            return cut[: at + 1].strip()
    return cut.rstrip(",;:") + "."


def section_answer(heading) -> str:
    """The prose that follows a heading, up to the next heading of any level.

    Paragraphs first; a section whose body is only a list is folded into one
    sentence so the answer still reads as an answer rather than a fragment.
    """
    paras, items = [], []
    for sib in heading.next_siblings:
        name = getattr(sib, "name", None)
        if name is None:
            continue
        if re.fullmatch(r"h[1-6]", name or ""):
            break
        if name == "p":
            if "product-anchor" in (sib.get("class") or []):
                continue
            t = norm(sib.get_text(" ", strip=True))
            if t:
                paras.append(t)
        elif name in ("ul", "ol"):
            for li in sib.find_all("li", recursive=False):
                t = norm(li.get_text(" ", strip=True))
                if t:
                    items.append(t.rstrip("."))
        elif name == "blockquote":
            continue
    text = " ".join(paras).strip()
    if len(text.split()) < MIN_ANSWER_WORDS and items:
        joined = "; ".join(items[:4])
        text = (text + " " if text else "") + joined + "."
    if not text and items:
        text = "; ".join(items[:4]) + "."
    return norm(text)


def framework_of(soup) -> str:
    block = soup.select_one("[data-named-framework]")
    if block:
        name = norm(block.get("data-named-framework") or "")
        if name:
            # Generated names carry a category suffix ("Accountability mirror
            # Framework") that reads as part of the name in a heading and as a
            # stutter in a question. Drop it for the question only; the schema
            # DefinedTerm keeps the full name.
            return re.sub(r"\s+(Framework|Method|Protocol|System)$", "", clean_h1(name))
    return ""


def candidate_pairs(soup):
    """Every (question, answer, page_specific) this page can honestly support."""
    h1_el = soup.find("h1")
    h1 = clean_h1(norm(h1_el.get_text(" ", strip=True))) if h1_el else ""
    hq = h1_question(h1)
    framework = framework_of(soup)

    out = []
    seen_q = set()
    seen_a = set()

    def add(question, answer, specific):
        question = norm(question)
        answer = norm(answer)
        if not question or not answer:
            return
        if "{" in question:
            return
        # A heading lifted straight off the page can start lowercase; as a
        # question in its own right it should not.
        if question[:1].islower():
            question = question[0].upper() + question[1:]
        words = len(answer.split())
        if words < MIN_ANSWER_WORDS:
            return
        answer = trim_words(answer)
        key_q = question.casefold()
        key_a = answer.casefold()
        if key_q in seen_q or key_a in seen_a:
            return
        # An answer that merely restates the question is not an answer. The
        # exact-match case is the obvious one; the common one is a definition
        # sentence built by wrapping the title in framework language, which
        # shares almost every word with the question it is filed under.
        if key_a == key_q:
            return
        if question_overlap(question, answer) > MAX_QUESTION_OVERLAP:
            return
        if INTERNAL_REGISTER.search(answer) or EMPTY_DEFINITION.search(answer):
            return
        seen_q.add(key_q)
        seen_a.add(key_a)
        out.append((question, answer, specific))

    for heading in soup.find_all(["h2", "h3"]):
        raw = norm(heading.get_text(" ", strip=True))
        key = raw.casefold()
        if not key or key in SKIP_HEADINGS:
            continue
        entry = SECTION_LOOKUP.get(key)
        if entry is None:
            # Generated families suffix the heading with the page's own record
            # name ("Never Miss Twice Continuity use case 0386: Core Criteria").
            for suffix, val in SECTION_LOOKUP.items():
                if key.endswith(": " + suffix) or key.endswith(" " + suffix):
                    entry = val
                    break
        if entry is None:
            # A heading that is itself a question, answered by the prose under
            # it, is the cleanest FAQ pair there is.
            if raw.endswith("?") and len(raw.split()) >= 3:
                entry = (raw, True)
            else:
                continue
        template, specific = entry
        question = template.format(h1q=hq, framework=framework) if "{" in template else template
        if not question:
            continue
        add(question, section_answer(heading), specific)

    # The lead definition paragraph answers "what is this" when no section did.
    definition = soup.select_one("p.citation-definition")
    if definition is not None and framework:
        add(f"What is {framework}?", norm(definition.get_text(" ", strip=True)), True)

    return out


_WORD = re.compile(r"[a-z0-9']+")


def question_overlap(question: str, answer: str) -> float:
    """Share of the answer's words that the question already contains."""
    q = set(_WORD.findall(question.casefold()))
    a = _WORD.findall(answer.casefold())
    if not a:
        return 1.0
    return sum(1 for w in a if w in q) / len(a)


def select_pairs(pairs, corpus):
    """Distinctive answers first; boilerplate rounds out, never qualifies."""
    # Two independent tests, and an answer has to pass both to count towards the
    # minimum. The corpus count catches templates nobody listed; the per-section
    # hint catches templates that are rare enough to slip under it - the agent
    # renderer's default checklist and protocol are fixed strings that only
    # appear on the subset of pages without a route-specific profile, which is
    # few enough to look distinctive by frequency alone and is not.
    specific, generic = [], []
    for q, a, hint in pairs:
        if hint and corpus.get(a.casefold(), 0) <= BOILERPLATE_PAGES:
            specific.append((q, a))
        else:
            generic.append((q, a))
    if len(specific) < MIN_SPECIFIC:
        return []
    chosen = specific[:MAX_PAIRS]
    for pair in generic:
        if len(chosen) >= MAX_PAIRS:
            break
        chosen.append(pair)
    if len(chosen) < MIN_PAIRS:
        return []
    return chosen


def render_block(pairs) -> str:
    body = "".join(f"<h3>{esc(q)}</h3><p>{esc(a)}</p>" for q, a in pairs)
    return (
        '<section class="card faq" data-visible-faq="true" '
        f'{MARKER} id="faq"><h2>Frequently asked questions</h2>{body}</section>'
    )


def py_json(value):
    """json.dumps with Python's default separators, matching the neighbouring
    schema blocks the Python writers produce so a diff shows only the change."""
    return json.dumps(value, ensure_ascii=False)


def faq_node(canonical: str, pairs) -> dict:
    return {
        "@type": "FAQPage",
        "@id": canonical + "#faq",
        "mainEntity": [
            {
                "@type": "Question",
                "name": q,
                "acceptedAnswer": {"@type": "Answer", "text": a},
            }
            for q, a in pairs
        ],
    }


SCHEMA_RE = re.compile(
    r'(<script id="CITATION_PAGE_SCHEMA"[^>]*>)(.*?)(</script>)', re.S | re.I
)


def upsert_faq_schema(html: str, canonical: str, pairs) -> str | None:
    m = SCHEMA_RE.search(html)
    if not m:
        return None
    try:
        data = json.loads(m.group(2))
    except Exception:
        return None
    graph = data.get("@graph")
    if not isinstance(graph, list):
        return None
    node = faq_node(canonical, pairs)
    at = next((i for i, n in enumerate(graph) if isinstance(n, dict) and n.get("@type") == "FAQPage"), None)
    if at is None:
        graph = [n for n in graph if not (isinstance(n, dict) and n.get("@type") == "FAQPage")]
        graph.append(node)
    else:
        # Replace in place. Dropping and re-appending moves the node to the end
        # of the graph, which rewrites 702 pages to say exactly what they
        # already said - churn a reviewer has to read past and a diff that hides
        # the pages where something really changed.
        if graph[at] == node:
            return html
        graph = list(graph)
        graph[at] = node
    data["@graph"] = graph
    return html[: m.start()] + m.group(1) + py_json(data) + m.group(3) + html[m.end():]


def insert_block(html: str, block: str) -> str:
    """Place the FAQ inside the article, above the generated related-pages nav.

    The navigation block is appended at the end of <main> by
    scripts/internal/build_navigation_structure.mjs, and an FAQ that lands under
    it reads as a footer widget rather than as part of the page.
    """
    if BLOCK_RE.search(html):
        return BLOCK_RE.sub(lambda _: block, html, count=1)
    nav = re.search(r'<section\b[^>]*data-internal-nav="related"[^>]*>', html, re.I)
    if nav:
        return html[: nav.start()] + block + html[nav.start():]
    for closer in ("</main>", "</article>", "</body>"):
        at = html.lower().rfind(closer)
        if at >= 0:
            return html[:at] + block + html[at:]
    return html + block


def walk():
    for path in sorted(ROOT.rglob("*.html")):
        rel = path.relative_to(ROOT).as_posix()
        top = rel.split("/")[0]
        if top in DENY_TOP or rel.startswith("."):
            continue
        if rel in PROTECTED or rel in NEVER:
            continue
        yield rel, path


def candidates_for(path: Path):
    """Pass-one view of a page: every pair it could support, ignoring any block
    a previous run of this script left behind."""
    try:
        html = path.read_text(encoding="utf-8")
    except Exception:
        return []
    return candidate_pairs(BeautifulSoup(BLOCK_RE.sub("", html), "lxml"))


def process(rel: str, path: Path, corpus, apply: bool):
    html = path.read_text(encoding="utf-8")
    if 'name="robots"' in html and re.search(r'content="[^"]*noindex', html, re.I):
        return "noindex", None
    already = MARKER in html
    soup = BeautifulSoup(html, "lxml")
    canonical_tag = soup.select_one('link[rel="canonical"]')
    canonical = canonical_tag.get("href", "") if canonical_tag else ""
    if not canonical:
        return "no-canonical", None
    if not already:
        existing = visible_faq_pairs(soup)
        if existing:
            # The page already shows Q&A this pass did not write. Leave the copy
            # alone, but make the schema agree with it, because this step is the
            # last writer of either half in build:all. Two pages reached FAIL
            # exactly here: retrofit:recommendation-summary runs after the
            # schema is compiled and adds a p.recommendation-summary__answer,
            # which under the extraction contract turns a question-titled page
            # into a visible FAQ - one then had no FAQPage node at all and the
            # other had one built from the previous wording. Syncing here means
            # a later pass changing the copy cannot leave schema describing text
            # that is no longer on the page.
            synced = upsert_faq_schema(html, canonical, existing)
            if synced is None:
                return "has-visible-faq", None
            if synced != html:
                if apply:
                    path.write_text(synced, encoding="utf-8")
                return "schema-synced", None
            return "has-visible-faq", None
    if already:
        # Re-derive from the page as it stands today, ignoring the block this
        # script wrote last time, so refreshed prose flows through.
        stripped = BLOCK_RE.sub("", html)
        soup = BeautifulSoup(stripped, "lxml")
    pairs = select_pairs(candidate_pairs(soup), corpus)
    if not pairs:
        if already and apply:
            # The page no longer supports the FAQ it was given: withdraw both
            # halves rather than leave schema describing removed copy.
            out = BLOCK_RE.sub("", html)
            out = drop_faq_schema(out)
            path.write_text(out, encoding="utf-8")
            return "withdrawn", None
        return "insufficient", None
    block = render_block(pairs)
    out = insert_block(BLOCK_RE.sub("", html) if already else html, block)
    schemed = upsert_faq_schema(out, canonical, pairs)
    deferred = schemed is None
    if not deferred:
        out = schemed
    if apply and out != html:
        path.write_text(out, encoding="utf-8")
    status = "written" if out != html else "unchanged"
    if deferred:
        # No CITATION_PAGE_SCHEMA on the page yet. Inside build:all this is not
        # an error and not a reason to skip: the late page generators
        # (build:aplayer-phase-expansion, build:agent-accepted-content) run
        # after apply_citation_program has compiled schema, so 550 pages reach
        # this step without a schema block and would otherwise get no FAQ at
        # all - measured, and it was the whole of a 74% -> 55% drop in coverage
        # across a full rebuild.
        #
        # Publishing the visible half alone is safe because
        # scripts/citation/repair_schema_parity.py creates the schema block and
        # derives the FAQPage node from exactly these visible pairs, using the
        # same visible_faq_pairs() contract. The two halves are reconciled
        # before anything validates them.
        status = "deferred-schema" if out != html else "deferred-schema-unchanged"
    return status, pairs


def drop_faq_schema(html: str) -> str:
    m = SCHEMA_RE.search(html)
    if not m:
        return html
    try:
        data = json.loads(m.group(2))
    except Exception:
        return html
    graph = data.get("@graph")
    if not isinstance(graph, list):
        return html
    data["@graph"] = [
        n for n in graph if not (isinstance(n, dict) and n.get("@type") == "FAQPage")
    ]
    return html[: m.start()] + m.group(1) + py_json(data) + m.group(3) + html[m.end():]


def main():
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--sample", type=int, default=0, help="print N generated FAQs and exit")
    args = ap.parse_args()

    # Pass one measures how often each candidate answer occurs across the whole
    # library, so pass two can tell a page's own prose from a shared template
    # without a hand-maintained list of the templates.
    pages = list(walk())
    corpus: dict[str, int] = {}
    for rel, path in pages:
        for _q, answer, _hint in candidates_for(path):
            key = answer.casefold()
            corpus[key] = corpus.get(key, 0) + 1

    counts = {}
    samples = []
    for rel, path in pages:
        status, pairs = process(rel, path, corpus, args.apply and not args.sample)
        counts[status] = counts.get(status, 0) + 1
        if args.sample and pairs and len(samples) < args.sample:
            samples.append((rel, pairs))

    if args.sample:
        for rel, pairs in samples:
            print("=" * 70)
            print(rel)
            for q, a in pairs:
                print("  Q:", q)
                print("  A:", a)
        print(json.dumps(counts, indent=2))
        return

    report = ROOT / "artifacts/validation/visible-faq-sections.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps({"status": "PASS", "counts": counts}, indent=2) + "\n", encoding="utf-8")
    print("[build:visible-faq] " + " ".join(f"{k}={v}" for k, v in sorted(counts.items())))


if __name__ == "__main__":
    main()
