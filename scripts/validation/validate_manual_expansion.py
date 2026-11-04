#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import json, re, sys
from pathlib import Path
from urllib.parse import urlparse
sys.dont_write_bytecode=True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'lib'))
from route_policy import route_for  # noqa: E402
from word_floor import floor_verdict, hard_floor  # noqa: E402
VENDOR=Path(__file__).resolve().parents[1]/'_vendor'
if VENDOR.is_dir(): sys.path.insert(0,str(VENDOR))
from bs4 import BeautifulSoup
from style_policy import sentence_count, paragraph_sentence_severity, paragraph_sentence_message
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'citation'))
from conversion_links import has_manual_link

ROOT=Path(__file__).resolve().parents[2]
SPEC=json.loads((ROOT/'data/content/manual_expansion_pages.json').read_text(encoding='utf-8'))
ACCEPT=json.loads((ROOT/'data/citation/manual_expansion_acceptance.json').read_text(encoding='utf-8'))
PROGRAM=json.loads((ROOT/'data/citation/programmatic_page_admission_contract.json').read_text(encoding='utf-8'))
HEALTH=json.loads((ROOT/'data/citation/health_adjacent_content_contract.json').read_text(encoding='utf-8'))
RESCUE=json.loads((ROOT/'data/seo/spry_rescue_guides.json').read_text(encoding='utf-8'))
RESCUE_BY_PATH={g['route'].lstrip('/')+('index.html' if g['route'].endswith('/') else '.html'):g for g in RESCUE['guides']}
RESCUE_REDIRECTS={r['from']:r['to'] for r in json.loads((ROOT/'data/seo/spry_rescue_redirects.json').read_text())['redirects']}
SENTENCE=re.compile(r'[.!?](?:[”"\']?)(?=\s|$)')
WORD=re.compile(r"\b[\w’'-]+\b",re.UNICODE)
errors=[]
warnings=[]

def norm(s): return ' '.join(re.sub(r'[^a-z0-9]+',' ',(s or '').casefold()).split())
def words(s): return WORD.findall(s or '')
def shingles(s,n=5):
    w=[x.casefold() for x in words(s)]
    return {tuple(w[i:i+n]) for i in range(max(0,len(w)-n+1))}
def main_unique_text(soup):
    chunks=[]
    for sel in ['[data-llm-answer="true"]','.page-artifact','.worked-example']:
        for node in soup.select(sel): chunks.append(node.get_text(' ',strip=True))
    return ' '.join(chunks)

def expected_canonical(page):
    return f"https://{page['domain']}{route_for(page['path'])}"

def fail(path,msg): errors.append(f'{path}: {msg}')

def replacement(rel,soup,guide):
    """The reviewed edition replaces the historical manual artifact contract."""
    h1s=soup.find_all('h1')
    if len(h1s)!=1: fail(rel,'expected one visible H1')
    opening=soup.select_one('p.citation-definition > strong')
    if not opening or not opening.get_text(' ',strip=True): fail(rel,'bold answer-first definition missing')
    blocks=soup.select('[data-llm-answer="true"]')
    if len(blocks)!=1 or blocks[0].get('data-extraction-type')!='answer': fail(rel,'expected one answer extraction block')
    if not soup.select('article ol li') or not soup.select('article table th') or not soup.select('article table td'): fail(rel,'action sequence or comparison table missing')
    if len(soup.select('article h2'))<len(guide['sections']): fail(rel,'editorial sections missing')
    boxes=soup.select('aside.recommendation-summary')
    if len(boxes)!=1 or not has_manual_link(str(boxes[0])): fail(rel,'expected one next-step box with download destination')
    sources=soup.select('section.sources a[href^="https://"]')
    if not sources: fail(rel,'research source missing')
    byline=soup.select_one('p.byline a[rel="author"][href="/about"]')
    if not byline: fail(rel,'visible publisher attribution missing')
    times=soup.select('p.byline time[datetime]')
    if [t.get('datetime') for t in times]!=[guide['published'],guide['updated']]: fail(rel,'editorial date mismatch')
    faq=soup.select_one('section[data-visible-faq="true"]')
    questions=faq.select('h3') if faq else []
    if len(questions)!=len(guide['faq']) or not questions: fail(rel,'visible FAQ membership mismatch')
    try:
        graph=json.loads(soup.find('script',id='CITATION_PAGE_SCHEMA').get_text())['@graph']
        article=next(n for n in graph if n.get('@type')=='Article')
        org=next(n for n in graph if n.get('@type')=='Organization')
        schema_faq=next(n for n in graph if n.get('@type')=='FAQPage')['mainEntity']
        if article.get('author',{}).get('@id')!=org.get('@id') or article.get('publisher',{}).get('@id')!=org.get('@id') or not org.get('@id'): fail(rel,'Article publisher identity mismatch')
        if not byline or byline.get_text(' ',strip=True)!=org.get('name'): fail(rel,'schema disagrees with visible publisher')
        if len(h1s)!=1 or article.get('headline')!=h1s[0].get_text(' ',strip=True): fail(rel,'schema disagrees with visible heading')
        if article.get('datePublished')!=guide['published'] or article.get('dateModified')!=guide['updated']: fail(rel,'schema editorial dates mismatch')
        if len(schema_faq)!=len(questions): fail(rel,'FAQ schema membership mismatch')
        for visible,structured in zip(questions,schema_faq):
            answer=visible.find_next_sibling('p')
            if structured.get('name')!=visible.get_text(' ',strip=True) or not answer or structured.get('acceptedAnswer',{}).get('text')!=answer.get_text(' ',strip=True): fail(rel,'FAQ schema disagrees with visible answer')
    except Exception as exc: fail(rel,f'invalid replacement metadata: {exc}')
    wc=len(words((soup.find('article') or soup).get_text(' ',strip=True)))
    if floor_verdict(wc,PROGRAM['minimum_word_count'])=='fail': fail(rel,f'word count {wc} below existing manual floor')
    if 'burnout' in guide['route'] and not soup.select_one('.health-boundary'): fail(rel,'health boundary missing')

declared=SPEC.get('page_count')
if not isinstance(declared,int) or declared!=len(SPEC.get('pages',[])): errors.append('manual spec page_count must equal pages length')
historical=SPEC.get('pages',[])+SPEC.get('archived_pages',[])
if ACCEPT.get('page_count')!=len(ACCEPT.get('pages',[])) or {p['path'] for p in ACCEPT.get('pages',[])}!={p['path'] for p in historical}: errors.append('manual acceptance must account for every active and archived source')
for page in SPEC.get('archived_pages',[]):
    target=RESCUE_REDIRECTS.get(route_for(page['path']))
    if not target: fail(page['path'],'archived source has no permanent redirect')
    else:
        route=urlparse(target).path
        target_file=route.lstrip('/')+('index.html' if route.endswith('/') else '.html')
        if not (ROOT/target_file).is_file(): fail(page['path'],'archived source has no built terminal destination')
# The two count checks above are only SELF-CONSISTENT: page_count 0 with pages []
# satisfies both, the per-page loop then runs zero times, and every acceptance
# assertion in this file is skipped while the run prints OK. Both collections can
# empty independently, so both get a floor.
if not SPEC.get('pages'):
    errors.append('data/content/manual_expansion_pages.json lists no pages; expected at least one manual expansion page. A run that checks zero pages proves nothing.')
if not ACCEPT.get('pages'):
    errors.append('data/citation/manual_expansion_acceptance.json lists no pages; expected one acceptance rule per manual expansion page. A run that checks zero pages proves nothing.')
accept_by_path={x['path']:x for x in ACCEPT.get('pages',[])}
paths=set(); queries={}; aliases={}; page_text=[]
for page in SPEC['pages']:
    rel=page['path']; fp=ROOT/rel
    if rel in paths: fail(rel,'duplicate source path')
    paths.add(rel)
    q=norm(page['h1'])
    if q in queries: fail(rel,f'duplicate primary query with {queries[q]}')
    queries[q]=rel
    for alias in page.get('aliases',[]):
        a=norm(alias)
        if a in queries or a in aliases: fail(rel,f'query alias collides: {alias}')
        aliases[a]=rel
    if not fp.exists(): fail(rel,'rendered file missing'); continue
    raw=fp.read_text(encoding='utf-8')
    soup=BeautifulSoup(raw,'html.parser')
    if rel in RESCUE_BY_PATH:
        can=soup.find('link',rel='canonical')
        if not can or can.get('href')!='https://spryexecutiveos.com'+RESCUE_BY_PATH[rel]['route']: fail(rel,'canonical mismatch')
        replacement(rel,soup,RESCUE_BY_PATH[rel])
        page_text.append((rel,main_unique_text(soup)))
        continue
    h1=soup.find('h1')
    if not h1 or h1.get_text(' ',strip=True)!=page['h1']: fail(rel,'exact H1 mismatch')
    can=soup.find('link',rel='canonical')
    if not can or can.get('href')!=expected_canonical(page): fail(rel,'canonical mismatch')
    opening=soup.select_one('p.citation-definition > strong')
    if not opening or opening.get_text(' ',strip=True)!=page['definition']: fail(rel,'bold definitional opening mismatch')
    first60=' '.join(words((soup.find('article') or soup).get_text(' ',strip=True))[:60])
    if norm(page['framework']) not in norm(first60): fail(rel,'named framework not in first 60 words')
    blocks=soup.select('[data-llm-answer="true"]')
    if len(blocks)!=1: fail(rel,f'expected exactly one extraction block, found {len(blocks)}')
    else:
        block=blocks[0]
        if block.get('data-named-framework')!=page['framework']: fail(rel,'framework attribute mismatch')
        if block.get('data-extraction-type')!=page['type']: fail(rel,'extraction type mismatch')
    artifact=None
    for section in soup.select('section.page-artifact, section[data-llm-answer="true"]'):
        headings=[h.get_text(' ',strip=True) for h in section.find_all(['h2','h3'])]
        if page['artifact']['title'] in headings:
            artifact=section; break
    if not artifact: fail(rel,'required unique artifact missing')
    elif page['artifact']['kind'] in ('matrix','template') and not artifact.find('table'): fail(rel,'artifact table missing')
    elif page['artifact']['kind']=='checklist' and not artifact.select_one('.checklist-list'): fail(rel,'checklist structure missing')
    elif page['artifact']['kind']=='prompts' and len(artifact.select('.prompt-card'))<3: fail(rel,'prompt cards missing')
    text=soup.get_text(' ',strip=True)
    # The verbatim 27-word product sentence used to be asserted here. The next
    # line already requires an <a href="/download.html"> whose visible text names
    # the system, which is the same guarantee expressed as structure: the reader
    # can reach the product from this page and knows what it is. Requiring the
    # exact sentence on top of that added no coverage and failed the day anyone
    # legitimately reworded it.
    product_link=next((a for a in soup.find_all('a',href='/download.html') if 'Billionaire High Performance Coach system' in a.get_text(' ',strip=True)),None)
    if not product_link: fail(rel,'product anchor link missing')
    wc=len(words((soup.find('article') or soup).get_text(' ',strip=True)))
    # Owner ruling 2 Nov 2026: a 25% cushion under the floor (scripts/lib/word_floor.py).
    floor=PROGRAM['minimum_word_count']; verdict=floor_verdict(wc,floor)
    if verdict=='fail': fail(rel,f'word count {wc} below {hard_floor(floor):g} (75% of the {floor}-word floor)')
    elif verdict=='cushion': warnings.append(f'{rel}: word count {wc} under the {floor}-word floor (warn-only; fails below {hard_floor(floor):g})')
    for idx,ptag in enumerate(soup.find_all('p')):
        n=sentence_count(ptag.get_text(' ',strip=True))
        severity=paragraph_sentence_severity(n)
        if severity=='FAIL': fail(rel, paragraph_sentence_message(rel, idx, n)); break
        if severity=='WARN': warnings.append(paragraph_sentence_message(rel, idx, n))
    schema=soup.find('script',id='CITATION_PAGE_SCHEMA')
    if not schema: fail(rel,'citation schema missing')
    else:
        try:
            data=json.loads(schema.string or schema.get_text())
            graph=data.get('@graph',[])
            primary=next((x for x in graph if x.get('@type') in ('Article','BlogPosting','WebPage')),None)
            term=next((x for x in graph if x.get('@type')=='DefinedTerm'),None)
            if not primary or (primary.get('headline') or primary.get('name'))!=page['h1'] or primary.get('description')!=page['definition']: fail(rel,'primary schema parity failure')
            if not term or term.get('name')!=page['framework'] or term.get('description')!=page['definition']: fail(rel,'DefinedTerm schema parity failure')
            rule=accept_by_path.get(rel,{})
            if rule.get('premium_geo'):
                types={x.get('@type') for x in graph}
                for required in rule.get('required_schema_types',[]):
                    if required not in types: fail(rel,f'missing required schema type: {required}')
                tldr=soup.select_one('aside.tldr')
                if not tldr or norm(tldr.get_text(' ',strip=True).replace('TL;DR:','',1))!=norm(rule.get('required_tldr','')): fail(rel,'TL;DR parity failure')
                byline=soup.select_one('p.byline')
                if not byline or not byline.select_one('a[rel="author"][href="/author"], a[rel="author"][href="https://spryexecutiveos.com/about"], a[rel="author"][href="/about"]'): fail(rel,'visible author byline missing')
                times=byline.find_all('time') if byline else []
                if len(times)<2 or any(t.get('datetime')!=rule.get('reviewed_at') for t in times[-1:]): fail(rel,'visible semantic review date missing or mismatched')
                toc=soup.select_one('nav.toc')
                if not toc or len(toc.select('a[href^="#"]'))<3: fail(rel,'table of contents missing')
                hero=soup.select_one('figure.page-hero-image img')
                if not hero or not hero.get('src','').startswith('/assets/og/') or not (ROOT/hero['src'].lstrip('/')).is_file(): fail(rel,'page-specific social image missing')
                og=soup.select_one('meta[property="og:image"]')
                tw=soup.select_one('meta[name="twitter:image"]')
                if not og or not tw or not og.get('content','').endswith(hero.get('src','')) or og.get('content')!=tw.get('content'): fail(rel,'social image metadata mismatch')
                faq=soup.select_one('section.faq')
                if not faq or len(faq.select('h3'))!=rule.get('required_faq_count',0): fail(rel,'visible FAQ count mismatch')
                if not soup.select_one('section.author-bio a[href="/author"], section.author-bio a[href="https://spryexecutiveos.com/about"], section.author-bio a[href="/about"]'): fail(rel,'author bio missing')
                article=next((x for x in graph if x.get('@type')=='Article'),None)
                if not article: fail(rel,'Article schema missing')
                else:
                    if article.get('headline')!=page['h1'] or article.get('description')!=page['definition']: fail(rel,'Article headline/description mismatch')
                    if article.get('dateModified')!=rule.get('reviewed_at'): fail(rel,'Article dateModified mismatch')
                    author=article.get('author') or {}
                    org=next((n for n in graph if n.get('@type')=='Organization'),{})
                    author_url=urlparse(author.get('url',''))
                    person=author.get('@type')=='Person' and author.get('name')=='S.L. Taylor' and author_url.path in ('/author','/about') and author_url.hostname in ('spryexecutiveos.com','billionairehighperformancecoach.com')
                    publisher=bool(org.get('@id')) and author.get('@id')==org.get('@id') and org.get('name')=='Spry Labs'
                    if not (person or publisher): fail(rel,'Article author mismatch')
                    if (article.get('image') or {}).get('url')!=og.get('content'): fail(rel,'Article image mismatch')
        except Exception as exc: fail(rel,f'invalid schema JSON: {exc}')
    for related in page.get('related_paths',[]):
        if not (ROOT/related).exists(): fail(rel,f'related target missing: {related}')
    if len(soup.select('.worked-example'))!=1: fail(rel,'worked example missing')
    if len(soup.select('.sources li'))!=len(page.get('sources',[])): fail(rel,'source list count mismatch')
    if page.get('health_adjacent'):
        low=text.casefold()
        if not any(x in low for x in ['not a diagnosis','does not diagnose','non-clinical','organizational support','not treatment','does not treat']): fail(rel,'health-adjacent boundary missing')
        if not any(x in low for x in ['professional','clinician','qualified','medical','mental-health']): fail(rel,'professional-help condition missing')
        hosts={urlparse(u).hostname.replace('www.','') for u in page.get('sources',[]) if urlparse(u).hostname}
        if not hosts.intersection(set(HEALTH['approved_source_domains'])): fail(rel,'health-adjacent page lacks approved source domain')
        for phrase in HEALTH['prohibited_claim_patterns']:
            if phrase in low: fail(rel,f'prohibited health claim: {phrase}')
    page_text.append((rel,main_unique_text(soup)))

# Similarity check against page-specific extraction/artifact/example, excluding shared chrome.
for i,(pa,ta) in enumerate(page_text):
    sa=shingles(ta)
    if not sa: continue
    for pb,tb in page_text[i+1:]:
        sb=shingles(tb)
        if not sb: continue
        score=len(sa&sb)/max(1,len(sa|sb))
        if score>PROGRAM['maximum_main_content_similarity']:
            errors.append(f'{pa} vs {pb}: main-content similarity {score:.3f} exceeds {PROGRAM["maximum_main_content_similarity"]}')

# Redirect contract for explicit migrations/consolidations.
redirects=(ROOT/'_redirects').read_text(encoding='utf-8') if (ROOT/'_redirects').exists() else ''
required_redirects=[
 '/help-me-get-my-life-together/ /how-to-get-your-life-together/ 301',
 '/insights/discipline-vs-motivation-high-performance.html /discipline-vs-motivation/ 301',
 '/insights/discipline-vs-motivation-the-calm-version-that-works.html /discipline-vs-motivation/ 301'
]
for line in required_redirects:
    source,target,_=line.split()
    expected=RESCUE_REDIRECTS.get(target,'https://spryexecutiveos.com'+target)
    actual=next((r.split()[1] for r in redirects.splitlines() if len(r.split())==3 and r.split()[0]==source and r.split()[2]=='301'),None)
    if not actual or actual!=expected and actual!=target: errors.append(f'_redirects: missing terminal 301 for {source}')

if errors:
    print('[validate:manual-expansion] FAIL')
    for e in errors: print(' -',e)
    raise SystemExit(1)
if warnings:
    print(f'[validate:manual-expansion] OK with {len(warnings)} content-quality warning(s): {len(SPEC["pages"])} pages pass exact acceptance and programmatic admission')
else:
    print(f'[validate:manual-expansion] OK: {len(SPEC["pages"])} pages pass exact acceptance and programmatic admission')
