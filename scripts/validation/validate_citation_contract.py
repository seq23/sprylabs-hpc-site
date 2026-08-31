#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json,re,sys,unicodedata
sys.dont_write_bytecode = True
from pathlib import Path

VENDOR_DIR = Path(__file__).resolve().parents[1] / "_vendor"
if VENDOR_DIR.is_dir():
    sys.path.insert(0, str(VENDOR_DIR))

from bs4 import BeautifulSoup
from style_policy import sentence_count, paragraph_sentence_severity, paragraph_sentence_message
CITATION_DIR = Path(__file__).resolve().parents[1] / "citation"
if str(CITATION_DIR) not in sys.path:
    sys.path.insert(0, str(CITATION_DIR))
from extraction_contract import validate_extraction

ROOT=Path.cwd(); errors=[]; infos=[]; warnings=[]
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
        # 'Who can use Billionaire High Performance Coach OS?' and
        # 'Look inside before you buy.' were asserted here AND listed in
        # data/page_contracts/bhpc_download_contract.json, which
        # validate_bhpc_page_contracts.mjs enforces. Two files keeping the same
        # list of strings with no link between them is how they drift: this copy
        # accepted an 'A-player mode' variant the data contract did not. The data
        # contract is the single owner; these duplicates are removed rather than
        # re-synchronised.
    if path=='index.html':
        if 'Your personal executive operating system for the AI you already use' not in text and 'Install A-player mode into your LLM' not in text:
            local.append(f"{path}: homepage hero promise missing")
        # 'Discover your own A-player mode' is already listed in
        # data/page_contracts/bhpc_homepage_contract.json and enforced by
        # validate_bhpc_page_contracts.mjs. Removed here as a proven duplicate.
    # Landing pages are allowed to use richer conversion sections instead of the rigid immediate definition pattern.
    return local

def valid_extraction(path,block,etype):
    if etype=='howto' and path in HOWTO_EXCEPTIONS:
        headings=[h.get_text(' ',strip=True) for h in block.find_all(['h2','h3'])]
        return sum(1 for h in headings if h.startswith('Prompt:'))>=2
    ok,_,_=validate_extraction(path,block,etype)
    return ok


# Routes owned by the external AI agent cannot be authored here (C1). A structural
# defect in agent-generated markup must be reported, but it must not hard-fail the
# release and strand every other page's deploy behind content we are not allowed to
# rewrite. Owned content keeps full hard enforcement.
_own=json.loads((ROOT/'data/content_ownership_registry.json').read_text()) if (ROOT/'data/content_ownership_registry.json').exists() else {'routes':[]}
AGENT_OWNED={r.get('source_file') for r in _own.get('routes',[]) if r.get('owner')=='paid_agent' or r.get('protected') is True}

pages=load('data/citation/citable_pages.json')['pages']
queries=load('data/citation/query_registry.json')['queries']
frameworks=load('data/citation/framework_registry.json')['frameworks']
active=[p for p in pages if p.get('status')=='ACTIVE']; bypath={p['path']:p for p in active}
# All three registries are looped over and every check lives inside a loop, so an
# emptied registry - or a status rename that leaves no page ACTIVE - printed
# "OK: 0 pages, 0 queries, 0 frameworks" while inspecting no page at all.
if not active:
    errors.append("data/citation/citable_pages.json lists no page with status 'ACTIVE'; every page check runs inside that loop, so a contract validated against zero pages proves nothing")
if not queries:
    errors.append('data/citation/query_registry.json lists no queries; query ownership and coverage are only checked inside that loop, so an empty registry proves nothing')
if not frameworks:
    errors.append('data/citation/framework_registry.json lists no frameworks; framework completeness is only checked inside that loop, so an empty registry proves nothing')
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
    if nq in normalized_pages: warnings.append(f"normalized query collision: {h1text!r} on {r['path']} and {normalized_pages[nq]}")
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
        if etype and not valid_extraction(r['path'],blocks[0],etype):
            _msg=f"{r['path']}: extraction block does not satisfy {etype} structure"
            (warnings if r['path'] in AGENT_OWNED else errors).append(
                _msg + (" (agent-owned route; reported, not release-blocking)" if r['path'] in AGENT_OWNED else ""))
    text=' '.join(soup.get_text(' ',strip=True).split())
    if PRODUCT not in text: errors.append(f"{r['path']}: exact product anchor sentence missing")
    if not any(a.get('href')=='/download.html' for a in soup.find_all('a')): errors.append(f"{r['path']}: /download.html link missing")
    if len([a for a in soup.find_all('a',href=True) if a['href'].startswith('/') and not a['href'].startswith('//')])<3: errors.append(f"{r['path']}: fewer than three internal links")
    if not soup.find('script',id='CITATION_PAGE_SCHEMA'): errors.append(f"{r['path']}: citation schema missing")
    if soup.find('br',class_='sentence-break'): errors.append(f"{r['path']}: legacy sentence-break markup remains")
    for idx,p in enumerate(soup.find_all('p')):
        n=sentence_count(p.get_text(' ',strip=True))
        severity=paragraph_sentence_severity(n)
        if severity=='FAIL':
            errors.append(paragraph_sentence_message(r['path'], idx, n))
            break
        if severity=='WARN':
            infos.append(paragraph_sentence_message(r['path'], idx, n))

covered={}
normalized_registry={}
for q in queries:
    nq=norm(q['query'])
    if nq in normalized_registry: warnings.append(f"normalized query registry collision: {q['query']!r} and {normalized_registry[nq]}")
    else: normalized_registry[nq]=q['query']
    paths=[q['primary_page'],*q.get('supporting_pages',[])]
    if q['primary_page'] not in bypath:
        (warnings if (ROOT/q['primary_page']).exists() else errors).append(f"{q['query_id']}: primary page not active")
    elif bypath[q['primary_page']]['query']!=q['query']: errors.append(f"{q['query_id']}: query and primary H1 differ")
    for path in paths:
        if path not in bypath:
            (warnings if (ROOT/path).exists() else errors).append(f"{q['query_id']}: mapped page not active: {path}")
        if path in covered: warnings.append(f"{path}: mapped to more than one query record")
        covered[path]=q['query_id']
for path in bypath:
    if path not in covered: warnings.append(f"{path}: active page missing from query registry")

normalized_frameworks={}
for f in frameworks:
    if not f.get('name') or not f.get('definition') or not f.get('primary_url'): errors.append(f"framework record incomplete: {f.get('framework_id')}")
    nf=norm(f.get('name',''))
    if nf in normalized_frameworks: warnings.append(f"normalized framework collision: {f.get('name')!r} and {normalized_frameworks[nf]}")
    else: normalized_frameworks[nf]=f.get('name')

llms=(ROOT/'llms.txt').read_text(errors='ignore')
answers_raw=(ROOT/'answers.json').read_text(errors='ignore')
# A bare `except: answer_items=[]` could not tell a corrupt or restructured
# answers.json apart from one that legitimately holds no items: either way the
# answers.json coverage warnings below silently checked nothing. Split the cases -
# unreadable is a defect, and an answer feed with no items is one too.
try:
    answers_payload=json.loads(answers_raw)
except Exception as exc:
    answers_payload=None
    errors.append(f'answers.json could not be parsed ({exc}); the answers.json query-coverage check reads its `items`, and an unreadable feed silently disables that check')
answer_items=[]
if answers_payload is not None:
    if not isinstance(answers_payload,dict):
        errors.append(f'answers.json is a {type(answers_payload).__name__}, not an object carrying `items`; the answers.json query-coverage check reads that key and would silently examine nothing')
    else:
        answer_items=answers_payload.get('items',[])
        if not answer_items:
            errors.append('answers.json carries no `items`; every query is then reported as missing coverage or none is checked at all, so an empty answer feed proves nothing')
answer_query_norms=set()
for item in answer_items:
    if not isinstance(item,dict):
        continue
    for key in ('title','query','question','description'):
        value=item.get(key)
        if isinstance(value,str):
            answer_query_norms.add(norm(value))
    for key in ('queries_supported','questions_supported'):
        value=item.get(key)
        if isinstance(value,list):
            for entry in value:
                if isinstance(entry,str):
                    answer_query_norms.add(norm(entry))
for q in queries:
    if q['query'] not in llms: warnings.append(f"llms.txt missing query: {q['query']}")
    if norm(q['query']) not in answer_query_norms and q['query'] not in answers_raw: warnings.append(f"answers.json missing query: {q['query']}")

out=ROOT/'artifacts/diagnostics/container-current/validate-citation-contract';out.mkdir(parents=True,exist_ok=True)
status='FAIL' if errors else ('PASS_WITH_STRONG_WARNING' if warnings else 'PASS')
(out/'summary.json').write_text(json.dumps({'status':status,'active_pages':len(active),'queries':len(queries),'frameworks':len(frameworks),'errors':errors,'warnings':warnings,'info':infos},indent=2)+'\n')
if errors:
    print(f"[validate:citation-contract] FAIL: {len(errors)} issue(s)",file=sys.stderr)
    for e in errors[:250]: print(' - '+e,file=sys.stderr)
    sys.exit(1)

if warnings:
    print(f"[validate:citation-contract] STRONG WARNING: {len(warnings)} governance/coverage issue(s); {len(active)} pages, {len(queries)} queries, {len(frameworks)} frameworks")
    for w in warnings[:250]: print(' - '+w)
else:
    print(f"[validate:citation-contract] OK: {len(active)} pages, {len(queries)} queries, {len(frameworks)} frameworks; info={len(infos)}")
