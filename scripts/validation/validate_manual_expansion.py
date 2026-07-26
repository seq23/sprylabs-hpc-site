#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import json, re, sys
from pathlib import Path
from urllib.parse import urlparse
sys.dont_write_bytecode=True
VENDOR=Path(__file__).resolve().parents[1]/'_vendor'
if VENDOR.is_dir(): sys.path.insert(0,str(VENDOR))
from bs4 import BeautifulSoup
from style_policy import sentence_count, paragraph_sentence_severity, paragraph_sentence_message

ROOT=Path(__file__).resolve().parents[2]
SPEC=json.loads((ROOT/'data/content/manual_expansion_pages.json').read_text(encoding='utf-8'))
ACCEPT=json.loads((ROOT/'data/citation/manual_expansion_acceptance.json').read_text(encoding='utf-8'))
PROGRAM=json.loads((ROOT/'data/citation/programmatic_page_admission_contract.json').read_text(encoding='utf-8'))
HEALTH=json.loads((ROOT/'data/citation/health_adjacent_content_contract.json').read_text(encoding='utf-8'))
PRODUCT='This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner.'
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
    route='/' + re.sub(r'index\.html$','',page['path'])
    return f"https://{page['domain']}{route}"

def fail(path,msg): errors.append(f'{path}: {msg}')

declared=SPEC.get('page_count')
if not isinstance(declared,int) or declared!=len(SPEC.get('pages',[])): errors.append('manual spec page_count must equal pages length')
if ACCEPT.get('page_count')!=len(ACCEPT.get('pages',[])) or ACCEPT.get('page_count')!=declared: errors.append('manual acceptance page_count must equal manual spec count')
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
    if PRODUCT not in text: fail(rel,'exact product anchor text missing')
    product_link=next((a for a in soup.find_all('a',href='/download.html') if 'Billionaire High Performance Coach system' in a.get_text(' ',strip=True)),None)
    if not product_link: fail(rel,'product anchor link missing')
    wc=len(words((soup.find('article') or soup).get_text(' ',strip=True)))
    if wc<PROGRAM['minimum_word_count']: fail(rel,f'word count {wc} below {PROGRAM["minimum_word_count"]}')
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
                if not byline or not byline.select_one('a[href="/author.html"][rel="author"]'): fail(rel,'visible author byline missing')
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
                if not soup.select_one('section.author-bio a[href="/author.html"]'): fail(rel,'author bio missing')
                article=next((x for x in graph if x.get('@type')=='Article'),None)
                if not article: fail(rel,'Article schema missing')
                else:
                    if article.get('headline')!=page['h1'] or article.get('description')!=page['definition']: fail(rel,'Article headline/description mismatch')
                    if article.get('dateModified')!=rule.get('reviewed_at'): fail(rel,'Article dateModified mismatch')
                    author=article.get('author') or {}
                    if author.get('@type')!='Person' or author.get('name')!='S.L. Taylor' or not author.get('url','').endswith('/author.html'): fail(rel,'Article author mismatch')
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
    if line not in redirects: errors.append(f'_redirects: missing {line}')

if errors:
    print('[validate:manual-expansion] FAIL')
    for e in errors: print(' -',e)
    raise SystemExit(1)
if warnings:
    print(f'[validate:manual-expansion] OK with {len(warnings)} content-quality warning(s): {len(SPEC["pages"])} pages pass exact acceptance and programmatic admission')
else:
    print(f'[validate:manual-expansion] OK: {len(SPEC["pages"])} pages pass exact acceptance and programmatic admission')
