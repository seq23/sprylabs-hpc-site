#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import json, re, sys
from pathlib import Path
from urllib.parse import urljoin
sys.dont_write_bytecode=True
VENDOR_DIR = Path(__file__).resolve().parents[1] / "_vendor"
if VENDOR_DIR.is_dir(): sys.path.insert(0, str(VENDOR_DIR))
from bs4 import BeautifulSoup
CITATION_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CITATION_DIR))
from extraction_contract import extract_scope_steps
ROOT=Path.cwd()
ACTIVE_SCOPE=ROOT/'data/release/active_mutation_scope.json'

def normalize_route(value):
    v=str(value or '').strip()
    if not v: return ''
    if not v.startswith('/'): v='/'+v
    if v=='/': return '/'
    if v.endswith('.html'): return v
    return v.rstrip('/')+'/'

def route_from_path(value):
    v=str(value or '').lstrip('./')
    if not v: return ''
    if v.endswith('/index.html'): return normalize_route('/'+v[:-len('index.html')])
    return normalize_route('/'+v)

def active_mutation_routes():
    if not ACTIVE_SCOPE.exists(): return None
    try:
        payload=json.loads(ACTIVE_SCOPE.read_text(encoding='utf-8'))
        return {normalize_route(r) for r in payload.get('routes',[]) if normalize_route(r)}
    except Exception:
        return set()

def norm(v): return ' '.join((v or '').split())
def schema_types(graph):
    out=[]
    for n in graph:
        t=n.get('@type')
        if isinstance(t,list): out.extend(t)
        elif t: out.append(t)
    return out

def visible_steps(soup):
    block=soup.select_one('[data-llm-answer="true"][data-extraction-type="howto"]')
    if not block: return []
    out=[]
    for step in extract_scope_steps(block):
        source_name=step.get('source_heading') or f"Step {step['number']}: {step['title']}"
        name=f"Step {step['number']}: {step['title']}"
        h=None
        for cand in block.find_all(['h2','h3','h4']):
            if norm(cand.get_text(' ',strip=True))==source_name:
                h=cand; break
        if h is None:
            continue
        if not h.get('id'):
            h['id']=re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-')
        text=step.get('description') or f"Use {name.lower()} as a bounded operating step, then record the observable result before continuing."
        out.append((name,norm(text),h.get('id')))
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

def update_schema(path: Path):
    raw=path.read_text(encoding='utf-8', errors='ignore')
    soup=BeautifulSoup(raw,'lxml')
    # Final editorial citation pages use one CITATION_PAGE_SCHEMA graph only.
    # Remove older blanket GEO/Product/Software schema fragments that the
    # contract explicitly bans on editorial citation surfaces.
    for obsolete in list(soup.select('script[data-geo-semantic=\"true\"]')):
        obsolete.decompose()
    script=soup.find('script',id='CITATION_PAGE_SCHEMA')
    can=soup.select_one('link[rel=\"canonical\"]'); canonical=can.get('href','') if can else ''
    h1=soup.find('h1'); h1text=norm(h1.get_text(' ',strip=True)) if h1 else path.stem.replace('-', ' ').title()
    definition=soup.select_one('p.citation-definition > strong')
    deftext=norm(definition.get_text(' ',strip=True)) if definition else h1text
    block=soup.select_one('[data-llm-answer=\"true\"]')
    framework=norm(block.get('data-named-framework')) if block and block.get('data-named-framework') else f'{h1text} Framework'
    if not script:
        script=soup.new_tag('script', id='CITATION_PAGE_SCHEMA', type='application/ld+json')
        target=soup.body or soup.head or soup
        target.append(script)
        data={'@context':'https://schema.org','@graph':[
            {'@type':'WebPage','@id':f'{canonical}#webpage' if canonical else None,'url':canonical,'name':h1text,'headline':h1text,'description':deftext,'mainEntityOfPage':canonical},
            {'@type':'DefinedTerm','@id':f'{canonical}#framework' if canonical else None,'name':framework,'description':deftext,'inDefinedTermSet':'Spry Executive OS'}
        ]}
    else:
        try: data=json.loads(script.string or script.get_text())
        except Exception: data={'@context':'https://schema.org','@graph':[]}
    graph=data.get('@graph',[])
    block=soup.select_one('[data-llm-answer="true"]')
    primary=next((x for x in graph if x.get('@type') in ('Article','BlogPosting','WebPage')),None)
    if not primary:
        primary={'@type':'WebPage','@id':f'{canonical}#webpage' if canonical else None}
        graph.insert(0, primary)
    if primary:
        if 'headline' in primary or primary.get('@type') in ('Article','BlogPosting'):
            primary['headline']=h1text
        primary['name']=h1text
        primary['description']=deftext
        if canonical:
            primary['url']=canonical
            primary['mainEntityOfPage']=canonical
    term=next((x for x in graph if x.get('@type')=='DefinedTerm'),None)
    if term and block:
        term['name']=norm(block.get('data-named-framework'))
        term['description']=deftext
    # FAQ parity
    vf=visible_faq(soup)
    faq=next((x for x in graph if x.get('@type')=='FAQPage'),None)
    if vf:
        if not faq:
            faq={'@type':'FAQPage','@id':f'{canonical}#faq','mainEntity':[]}; graph.append(faq)
        faq['mainEntity']=[{'@type':'Question','name':q,'acceptedAnswer':{'@type':'Answer','text':a}} for q,a in vf]
    elif faq:
        graph.remove(faq)
    # HowTo parity
    vs=visible_steps(soup)
    how=next((x for x in graph if x.get('@type')=='HowTo'),None)
    if len(vs)>=2:
        if not how:
            how={'@type':'HowTo','@id':f'{canonical}#howto','name':h1text,'step':[]}; graph.append(how)
        how['name']=h1text
        how['step']=[{'@type':'HowToStep','name':name,'text':text,'url':f'{canonical}#{ident}' if ident else None} for name,text,ident in vs]
    elif how:
        graph.remove(how)
    # Breadcrumb parity
    vb=visible_breadcrumbs(soup,canonical)
    bread=next((x for x in graph if x.get('@type')=='BreadcrumbList'),None)
    if vb:
        if not bread:
            bread={'@type':'BreadcrumbList','@id':f'{canonical}#breadcrumb','itemListElement':[]}; graph.append(bread)
        bread['itemListElement']=[{'@type':'ListItem','position':i+1,'name':name,'item':item} for i,(name,item) in enumerate(vb)]
    elif bread:
        graph.remove(bread)
    # Article parity: premium manual/editorial pages may carry Article schema only
    # when the visible page contains a byline, author URL, semantic dates, and
    # social image metadata. Keep WebPage as the primary route entity and add a
    # separate Article node for editorial proof.
    byline=soup.select_one('p.byline')
    author=byline.select_one('a[rel="author"]') if byline else None
    times=byline.find_all('time') if byline else []
    og=soup.select_one('meta[property="og:image"]')
    ogurl=og.get('content','') if og else ''
    article=next((x for x in graph if x.get('@type')=='Article'),None)
    if byline and author and len(times)>=2 and ogurl:
        if not article:
            article={'@type':'Article','@id':f'{canonical}#article'}; graph.append(article)
        article.update({
            'headline': h1text,
            'name': h1text,
            'description': deftext,
            'url': canonical,
            'mainEntityOfPage': canonical,
            'datePublished': times[0].get('datetime'),
            'dateModified': times[-1].get('datetime'),
            'author': {
                '@type': 'Person',
                'name': norm(author.get_text(' ',strip=True)),
                'url': urljoin(canonical, author.get('href',''))
            },
            'publisher': {
                '@type': 'Organization',
                'name': 'Spry Labs',
                'logo': {'@type': 'ImageObject', 'url': 'https://billionairehighperformancecoach.com/assets/books/og/bhpc-og-black.png'}
            },
            'image': {'@type': 'ImageObject', 'url': ogurl}
        })
    elif article:
        graph.remove(article)
    data['@graph']=graph
    graph=[node for node in graph if node]
    data['@context']='https://schema.org'
    data['@graph']=graph
    script.string=json.dumps(data, ensure_ascii=False).replace('<','\\u003c')
    new=str(soup)
    if new!=raw:
        path.write_text(new,encoding='utf-8')
        return True
    return False

pages=json.loads((ROOT/'data/citation/citable_pages.json').read_text(encoding='utf-8'))['pages']
allowed=active_mutation_routes()
changed=0; skipped_frozen_scope=0
for rec in pages:
    if rec.get('status','ACTIVE')!='ACTIVE': continue
    rel=rec.get('path')
    if not rel: continue
    if allowed is not None and route_from_path(rel) not in allowed:
        skipped_frozen_scope += 1
        continue
    fp=ROOT/rel
    if fp.is_file() and update_schema(fp): changed+=1
print(f'repair_schema_parity: changed={changed}; scoped={allowed is not None}; skipped_outside_scope={skipped_frozen_scope}')
