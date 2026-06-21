#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json,re,sys,unicodedata
sys.dont_write_bytecode = True
from pathlib import Path

VENDOR_DIR = Path(__file__).resolve().parents[1] / "_vendor"
if VENDOR_DIR.is_dir():
    sys.path.insert(0, str(VENDOR_DIR))

from bs4 import BeautifulSoup

ROOT=Path.cwd(); errors=[]; infos=[]
PRODUCT="This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner."
LANDING_PAGE_EXCEPTIONS={'index.html','download.html'}
GUMROAD='https://sprylabs.gumroad.com/l/billionaire-high-performance-coach'
DISCOVERY='https://aplayermode.com'

SENTENCE_RE=re.compile(r'[.!?](?:[”"\']?)(?=\s|$)')
MOJIBAKE=('â\x80\x9c','â\x80\x9d','â\x80\x98','â\x80\x99','â\x80\x94','â\x80\x93','Â·','Â©','�')
HOWTO_EXCEPTIONS={'best-chatgpt-prompts-for-productivity.html'}

def load(p): return json.loads((ROOT/p).read_text())
def norm(v):
    v=unicodedata.normalize('NFKD',v or '').encode('ascii','ignore').decode().casefold().replace('&',' and ')
    return ' '.join(re.sub(r'[^a-z0-9]+',' ',v).split())
def bad_definition(value,h1):
    d=' '.join((value or '').split())
    if not d or len(d.split())<6:return True
    if ' is for ' in d.lower() and norm(d).count(norm(h1))>=2:return True
    if d.lower().startswith(h1.lower()+' is '+h1.lower()):return True
    if re.search(r'\bis about\b',d,re.I):return True
    if d.endswith('follow-t.') or d.endswith('follow-t'):return True
    return False

def valid_conversion_landing_page(path, soup, raw):
    local=[]
    h1=soup.find_all('h1')
    if len(h1)!=1:
        local.append(f"{path}: expected one H1 on conversion landing page, found {len(h1)}")
    text=' '.join(soup.get_text(' ',strip=True).split())
    if 'Billionaire High Performance Coach' not in text:
        local.append(f"{path}: conversion page missing product name")
    if 'A-player mode' not in text and 'A-Player Mode' not in text:
        local.append(f"{path}: conversion page missing A-player mode framing")
    if GUMROAD not in raw:
        local.append(f"{path}: conversion page missing Gumroad purchase path")
    if path=='index.html' and DISCOVERY not in raw:
        local.append(f"{path}: homepage missing APlayerMode discovery path")
    if path=='download.html' and f'href="{DISCOVERY}"' in raw:
        local.append(f"{path}: discovery page must not include circular APlayerMode CTA")
    if not soup.find('script',id='CITATION_PAGE_SCHEMA'):
        local.append(f"{path}: conversion page citation schema missing")
    if not soup.find('script',type='application/ld+json'):
        local.append(f"{path}: conversion page JSON-LD missing")
    old_phrases=['Framework is a named operating framework','also known as the A Player Mode system','Download the A Player Mode system','Canonical redirect: https://aplayermode.com']
    for phrase in old_phrases:
        if phrase in text or phrase in raw:
            local.append(f"{path}: forbidden legacy conversion phrase remains: {phrase}")
    if path=='download.html':
        if 'Discover your own A-player mode' not in text:
            local.append(f"{path}: discovery-page promise missing")
        if 'Who can use A-player mode' not in text:
            local.append(f"{path}: audience recognition section missing")
        if 'Look inside before you buy' not in text:
            local.append(f"{path}: inside-system preview missing")
    if path=='index.html':
        if 'Install A-player mode into your LLM' not in text:
            local.append(f"{path}: homepage hero promise missing")
        if 'Discover your own A-player mode' not in text:
            local.append(f"{path}: homepage discovery CTA copy missing")
    # Landing pages are allowed to use richer conversion sections instead of the rigid immediate definition pattern.
    return local

def valid_extraction(path,block,etype):
    if etype=='comparison':
        return block.find('table') is not None
    if etype=='concept':
        return block.find(['ul','ol']) is not None and len(block.find_all('li'))>=3
    if etype=='decision':
        text=' '.join(block.get_text(' ',strip=True).lower().split())
        return (('when to use' in text or 'choose' in text or 'use ' in text) and (block.find(['ul','ol','table']) or len(block.find_all(['h2','h3']))>=2))
    if etype=='howto':
        headings=[h.get_text(' ',strip=True) for h in block.find_all(['h2','h3'])]
        if path in HOWTO_EXCEPTIONS:
            return sum(1 for h in headings if h.startswith('Prompt:'))>=2
        return sum(1 for h in headings if re.match(r'^(Step|Phase|Block|Stage)\s+\d+',h,re.I))>=3
    return False

pages=load('data/citation/citable_pages.json')['pages']
queries=load('data/citation/query_registry.json')['queries']
frameworks=load('data/citation/framework_registry.json')['frameworks']
active=[p for p in pages if p.get('status')=='ACTIVE']; bypath={p['path']:p for p in active}
normalized_pages={}
for r in active:
    fp=ROOT/r['path']
    if not fp.exists(): errors.append(f"{r['path']}: missing"); continue
    raw=fp.read_text(errors='ignore')
    for marker in MOJIBAKE:
        if marker in raw: errors.append(f"{r['path']}: malformed encoding sequence {marker!r}")
    soup=BeautifulSoup(raw,'html.parser')
    if r['path'] in LANDING_PAGE_EXCEPTIONS:
        errors.extend(valid_conversion_landing_page(r['path'], soup, raw))
        covered_landing_note = True
        continue
    h1=soup.find_all('h1')
    if len(h1)!=1: errors.append(f"{r['path']}: expected one H1, found {len(h1)}"); continue
    h1text=' '.join(h1[0].get_text(' ',strip=True).split())
    if h1text!=r['query']: errors.append(f"{r['path']}: H1/query mismatch")
    nq=norm(h1text)
    if nq in normalized_pages: errors.append(f"normalized query collision: {h1text!r} on {r['path']} and {normalized_pages[nq]}")
    else: normalized_pages[nq]=r['path']
    opening=h1[0].find_next_sibling('p')
    if not opening or 'citation-definition' not in opening.get('class',[]) or not opening.find('strong'):
        errors.append(f"{r['path']}: missing immediate bold citation definition")
    else:
        definition=' '.join(opening.find('strong').get_text(' ',strip=True).split())
        words=' '.join(opening.get_text(' ',strip=True).split()).split()[:60]
        if r['framework'].casefold() not in ' '.join(words).casefold(): errors.append(f"{r['path']}: framework not in first 60 opening words")
        if definition!=r.get('definition'): errors.append(f"{r['path']}: visible definition/registry drift")
        if bad_definition(definition,h1text): errors.append(f"{r['path']}: weak or tautological definition")
    blocks=soup.select('[data-llm-answer="true"]')
    if len(blocks)!=1: errors.append(f"{r['path']}: expected one extraction block, found {len(blocks)}")
    else:
        etype=blocks[0].get('data-extraction-type')
        framework=blocks[0].get('data-named-framework')
        if not etype: errors.append(f"{r['path']}: extraction type missing")
        if not framework: errors.append(f"{r['path']}: named framework attribute missing")
        if framework!=r['framework']: errors.append(f"{r['path']}: extraction framework/registry drift")
        if etype!=r['extraction_type']: errors.append(f"{r['path']}: extraction type/registry drift")
        if etype and not valid_extraction(r['path'],blocks[0],etype): errors.append(f"{r['path']}: extraction block does not satisfy {etype} structure")
    text=' '.join(soup.get_text(' ',strip=True).split())
    if PRODUCT not in text: errors.append(f"{r['path']}: exact product anchor sentence missing")
    if not any(a.get('href')=='/download.html' for a in soup.find_all('a')): errors.append(f"{r['path']}: /download.html link missing")
    if len([a for a in soup.find_all('a',href=True) if a['href'].startswith('/') and not a['href'].startswith('//')])<3: errors.append(f"{r['path']}: fewer than three internal links")
    if not soup.find('script',id='CITATION_PAGE_SCHEMA'): errors.append(f"{r['path']}: citation schema missing")
    if soup.find('br',class_='sentence-break'): errors.append(f"{r['path']}: legacy sentence-break markup remains")
    for idx,p in enumerate(soup.find_all('p')):
        n=len(SENTENCE_RE.findall(' '.join(p.get_text(' ',strip=True).split())))
        if n>3:
            errors.append(f"{r['path']}: paragraph {idx+1} exceeds three sentences ({n})")
            break

covered={}
normalized_registry={}
for q in queries:
    nq=norm(q['query'])
    if nq in normalized_registry: errors.append(f"normalized query registry collision: {q['query']!r} and {normalized_registry[nq]}")
    else: normalized_registry[nq]=q['query']
    paths=[q['primary_page'],*q.get('supporting_pages',[])]
    if q['primary_page'] not in bypath: errors.append(f"{q['query_id']}: primary page not active")
    elif bypath[q['primary_page']]['query']!=q['query']: errors.append(f"{q['query_id']}: query and primary H1 differ")
    for path in paths:
        if path not in bypath: errors.append(f"{q['query_id']}: mapped page not active: {path}")
        if path in covered: errors.append(f"{path}: mapped to more than one query record")
        covered[path]=q['query_id']
for path in bypath:
    if path not in covered: errors.append(f"{path}: active page missing from query registry")

normalized_frameworks={}
for f in frameworks:
    if not f.get('name') or not f.get('definition') or not f.get('primary_url'): errors.append(f"framework record incomplete: {f.get('framework_id')}")
    nf=norm(f.get('name',''))
    if nf in normalized_frameworks: errors.append(f"normalized framework collision: {f.get('name')!r} and {normalized_frameworks[nf]}")
    else: normalized_frameworks[nf]=f.get('name')

llms=(ROOT/'llms.txt').read_text(errors='ignore'); answers=(ROOT/'answers.json').read_text(errors='ignore')
for q in queries:
    if q['query'] not in llms: errors.append(f"llms.txt missing query: {q['query']}")
    if q['query'] not in answers: errors.append(f"answers.json missing query: {q['query']}")

out=ROOT/'artifacts/diagnostics/container-current/validate-citation-contract';out.mkdir(parents=True,exist_ok=True)
(out/'summary.json').write_text(json.dumps({'status':'FAIL' if errors else 'PASS','active_pages':len(active),'queries':len(queries),'frameworks':len(frameworks),'errors':errors,'info':infos},indent=2)+'\n')
if errors:
    print(f"[validate:citation-contract] FAIL: {len(errors)} issue(s)",file=sys.stderr)
    for e in errors[:250]: print(' - '+e,file=sys.stderr)
    sys.exit(1)
print(f"[validate:citation-contract] OK: {len(active)} pages, {len(queries)} queries, {len(frameworks)} frameworks")
