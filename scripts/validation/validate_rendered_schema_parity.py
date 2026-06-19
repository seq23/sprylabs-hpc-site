#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import json, re, sys
from pathlib import Path
from urllib.parse import urljoin
sys.dont_write_bytecode=True
VENDOR=Path(__file__).resolve().parents[1]/'_vendor'
if VENDOR.is_dir(): sys.path.insert(0,str(VENDOR))
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[2]
REG=json.loads((ROOT/'data/citation/citable_pages.json').read_text(encoding='utf-8'))
errors=[]; counts={'pages':0,'faq_pages':0,'howto_pages':0,'breadcrumb_pages':0,'article_pages':0}

def norm(value): return ' '.join((value or '').split())
def fail(path,msg): errors.append(f'{path}: {msg}')
def schema_types(graph):
    out=[]
    for n in graph:
        t=n.get('@type')
        if isinstance(t,list): out.extend(t)
        elif t: out.append(t)
    return out

def visible_faq(soup):
    section=soup.select_one('section[data-visible-faq="true"], section.faq, section#faq, section.citation-faq')
    if not section: return []
    pairs=[]
    for h in section.find_all(['h3','h2']):
        q=norm(h.get_text(' ',strip=True))
        if q.casefold().startswith('frequently asked'): continue
        p=h.find_next_sibling('p')
        if p: pairs.append((q,norm(p.get_text(' ',strip=True))))
    return pairs

def visible_steps(soup):
    block=soup.select_one('[data-llm-answer="true"][data-extraction-type="howto"]')
    if not block: return []
    out=[]
    for h in block.find_all(['h2','h3']):
        name=norm(h.get_text(' ',strip=True))
        if not re.match(r'^(?:Step|Phase|Stage|Block)\s+\d+\b',name,re.I): continue
        parts=[]
        n=h.find_next_sibling()
        while n and getattr(n,'name',None) not in ('h2','h3'):
            if getattr(n,'name',None) in ('p','li'):
                value=norm(n.get_text(' ',strip=True))
                if value: parts.append(value)
            n=n.find_next_sibling()
        out.append((name,norm(' '.join(parts)),h.get('id')))
    return out

def visible_breadcrumbs(soup, canonical):
    nav=soup.select_one('nav.breadcrumb[aria-label="Breadcrumb"], nav[aria-label="Breadcrumb"]')
    if not nav: return []
    items=[]
    for a in nav.find_all('a'):
        items.append((norm(a.get_text(' ',strip=True)),urljoin(canonical,a.get('href',''))))
    current=nav.find_all('span')
    current=[x for x in current if 'sep' not in (x.get('class') or [])]
    if current: items.append((norm(current[-1].get_text(' ',strip=True)),canonical))
    return items

pages=REG.get('pages',REG if isinstance(REG,list) else [])
for rec in pages:
    if rec.get('status','ACTIVE')!='ACTIVE': continue
    rel=rec.get('path') or rec.get('source_file')
    if not rel: continue
    fp=ROOT/rel
    if not fp.is_file(): fail(rel,'active page missing'); continue
    counts['pages']+=1
    soup=BeautifulSoup(fp.read_text(encoding='utf-8'),'html.parser')
    if soup.select('script[data-geo-semantic="true"]'): fail(rel,'stale blanket GEO schema present')
    script=soup.find('script',id='CITATION_PAGE_SCHEMA')
    if not script: fail(rel,'CITATION_PAGE_SCHEMA missing'); continue
    try: data=json.loads(script.string or script.get_text())
    except Exception as e: fail(rel,f'invalid schema JSON: {e}'); continue
    graph=data.get('@graph',[])
    types=schema_types(graph)
    h1=soup.find('h1'); h1text=norm(h1.get_text(' ',strip=True)) if h1 else ''
    definition=soup.select_one('p.citation-definition > strong')
    deftext=norm(definition.get_text(' ',strip=True)) if definition else ''
    can=soup.select_one('link[rel="canonical"]'); canonical=can.get('href','') if can else ''
    primary=next((x for x in graph if x.get('@type') in ('Article','BlogPosting','WebPage')),None)
    if not primary: fail(rel,'primary Article/BlogPosting/WebPage entity missing')
    else:
        if norm(primary.get('headline') or primary.get('name'))!=h1text: fail(rel,'schema headline/name does not match visible H1')
        if norm(primary.get('description'))!=deftext: fail(rel,'schema description does not match visible definition')
        if primary.get('url')!=canonical: fail(rel,'primary schema URL does not match canonical')
        main=primary.get('mainEntityOfPage')
        mainid=main.get('@id') if isinstance(main,dict) else main
        if mainid!=canonical: fail(rel,'mainEntityOfPage does not match canonical')
    term=next((x for x in graph if x.get('@type')=='DefinedTerm'),None)
    block=soup.select_one('[data-llm-answer="true"]')
    if not term or not block or norm(term.get('name'))!=norm(block.get('data-named-framework')) or norm(term.get('description'))!=deftext:
        fail(rel,'DefinedTerm does not match visible framework/definition')

    vf=visible_faq(soup); faq=next((x for x in graph if x.get('@type')=='FAQPage'),None)
    if vf:
        counts['faq_pages']+=1
        if not faq: fail(rel,'visible FAQ exists without FAQPage schema')
        else:
            sf=[(norm(x.get('name')),norm((x.get('acceptedAnswer') or {}).get('text'))) for x in faq.get('mainEntity',[])]
            if sf!=vf: fail(rel,'FAQ schema question/answer text does not exactly match visible FAQ')
    elif faq: fail(rel,'FAQPage schema exists without visible FAQ')

    vs=visible_steps(soup); how=next((x for x in graph if x.get('@type')=='HowTo'),None)
    if how:
        counts['howto_pages']+=1
        hs=[(norm(x.get('name')),norm(x.get('text')),x.get('url')) for x in how.get('step',[])]
        expected=[(name,text,f'{canonical}#{ident}' if ident else None) for name,text,ident in vs]
        if hs!=expected: fail(rel,'HowTo steps do not exactly match visible steps/order/URLs')
    extraction=rec.get('extraction_type') or rec.get('type')
    if extraction=='howto' and len(vs)>=3 and not how: fail(rel,'qualifying visible how-to steps lack HowTo schema')
    if how and len(vs)<2: fail(rel,'HowTo schema lacks a genuine visible procedure')

    vb=visible_breadcrumbs(soup,canonical); bread=next((x for x in graph if x.get('@type')=='BreadcrumbList'),None)
    if vb:
        counts['breadcrumb_pages']+=1
        if not bread: fail(rel,'visible breadcrumb exists without BreadcrumbList schema')
        else:
            sb=[(norm(x.get('name')),x.get('item')) for x in bread.get('itemListElement',[])]
            if sb!=vb: fail(rel,'BreadcrumbList does not match visible breadcrumb hierarchy')
            positions=[x.get('position') for x in bread.get('itemListElement',[])]
            if positions!=list(range(1,len(positions)+1)): fail(rel,'breadcrumb positions are not sequential')
    elif bread: fail(rel,'BreadcrumbList exists without visible breadcrumb')

    article=next((x for x in graph if x.get('@type') in ('Article','BlogPosting')),None)
    if article:
        counts['article_pages']+=1
        by=soup.select_one('p.byline')
        if not by: fail(rel,'Article schema exists without visible byline')
        else:
            author=by.select_one('a[rel="author"]'); times=by.find_all('time')
            sa=article.get('author') or {}; pub=article.get('publisher') or {}; image=article.get('image') or {}
            if not author or sa.get('name')!=norm(author.get_text(' ',strip=True)) or sa.get('url')!=urljoin(canonical,author.get('href','')): fail(rel,'Article author does not match visible byline')
            if len(times)<2 or article.get('datePublished')!=times[0].get('datetime') or article.get('dateModified')!=times[-1].get('datetime'): fail(rel,'Article dates do not match visible semantic dates')
            og=soup.select_one('meta[property="og:image"]'); ogurl=og.get('content','') if og else ''
            if image.get('url')!=ogurl: fail(rel,'Article image does not match Open Graph image')
            if not (pub.get('logo') or {}).get('url'): fail(rel,'Article publisher logo missing')
    for n in graph:
        blob=json.dumps(n).casefold()
        if any(k in blob for k in ('aggregaterating','ratingvalue','ratingcount','reviewcount')): fail(rel,'unsupported rating/review schema present')

out=ROOT/'artifacts/diagnostics/container-current/validate-rendered-schema-parity/summary.json'
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'status':'FAIL' if errors else 'PASS','counts':counts,'errors':errors},indent=2),encoding='utf-8')
if errors:
    print('[validate:rendered-schema-parity] FAIL')
    for e in errors: print(' -',e)
    raise SystemExit(1)
print(f"[validate:rendered-schema-parity] OK: {counts['pages']} pages; FAQ={counts['faq_pages']}, HowTo={counts['howto_pages']}, Breadcrumb={counts['breadcrumb_pages']}, Article={counts['article_pages']}")
