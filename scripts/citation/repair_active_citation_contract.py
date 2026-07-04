#!/usr/bin/env python3
import json, re, sys, html
from pathlib import Path
sys.dont_write_bytecode=True
VENDOR_DIR = Path(__file__).resolve().parents[1] / "_vendor"
if VENDOR_DIR.is_dir(): sys.path.insert(0, str(VENDOR_DIR))
from bs4 import BeautifulSoup
ROOT=Path.cwd()
PRODUCT="This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner."
WORD_PRODUCT="Billionaire High Performance Coach system"
SENTENCE_RE=re.compile(r'[^.!?]+[.!?](?:[”"\']?)(?=\s|$)|[^.!?]+$')
H1_RE=re.compile(r'<h1(?:\s[^>]*)?>(.*?)</h1>', re.I|re.S)

def compact(v): return ' '.join(str(v or '').split())
def strip_tags(v): return html.unescape(compact(re.sub(r'<[^>]+>', ' ', v or '')))
def html_escape_min(v):
    return (str(v or '').replace('&','&amp;').replace('<','&lt;').replace('>','&gt;'))

def load_json(path, fallback):
    try: return json.loads(path.read_text(encoding='utf-8'))
    except Exception: return fallback

pages_data=load_json(ROOT/'data/citation/citable_pages.json', {'pages':[]})
pages=pages_data.get('pages', [])
active=[p for p in pages if p.get('status')=='ACTIVE']

agent=load_json(ROOT/'data/citation/agent_recommendation_acceptance.json', {})
H1_OVERRIDES={}
for item in agent.get('fixes',[]) or []:
    if item.get('h1'): H1_OVERRIDES[item.get('path')]=item.get('h1')
for item in agent.get('opportunities',[]) or []:
    if item.get('query'): H1_OVERRIDES[item.get('path')]=item.get('query')

changed=[]
metadata_changed=False
parsed=0
skipped=0
for r in active:
    definition=compact(r.get('definition'))
    framework=compact(r.get('framework'))
    first_60=' '.join(definition.split()[:60]).casefold()
    if framework and framework.casefold() not in first_60:
        r['definition']=f"{framework}: {definition or ('explains ' + r.get('query','this topic'))}"
        metadata_changed=True
    path=ROOT/r.get('path','')
    if not path.exists():
        continue
    raw=path.read_text(encoding='utf-8', errors='ignore')
    expected_h1=H1_OVERRIDES.get(r['path'], r.get('query',''))
    expected_framework=r.get('framework','')
    expected_type=r.get('extraction_type','concept')
    h1s=H1_RE.findall(raw)
    quick_ok=(
        len(h1s)==1
        and strip_tags(h1s[0])==expected_h1
        and 'citation-definition' in raw
        and 'data-llm-answer="true"' in raw
        and 'data-priority-citation="true"' in raw
        and f'data-extraction-type="{expected_type}"' in raw
        and (f'data-named-framework="{expected_framework}"' in raw or f'data-named-framework="{html_escape_min(expected_framework)}"' in raw)
        and WORD_PRODUCT in raw
        and '/download.html' in raw
        and '<></>' not in raw
    )
    if quick_ok:
        skipped += 1
        continue
    # Fast path for generated/manual pages that only lost the priority marker
    # during build. Avoid BeautifulSoup over ~1.6k large pages on every prepush.
    bad_fast=[]
    h1_ok=len(h1s)==1 and strip_tags(h1s[0])==expected_h1
    base_fast_checks={
        'h1': h1_ok,
        'citation': 'citation-definition' in raw,
        'llm': 'data-llm-answer="true"' in raw,
        'type': f'data-extraction-type="{expected_type}"' in raw,
        'framework': (f'data-named-framework="{expected_framework}"' in raw or f'data-named-framework="{html_escape_min(expected_framework)}"' in raw),
        'product': WORD_PRODUCT in raw,
        'download': '/download.html' in raw,
        'frag': '<></>' not in raw,
    }
    bad_fast=[k for k,v in base_fast_checks.items() if not v]
    if not bad_fast and 'data-priority-citation="true"' not in raw:
        new_raw=re.sub(r'(<[^>]+data-llm-answer="true")', r'\1 data-priority-citation="true"', raw, count=1)
        if new_raw!=raw:
            path.write_text(new_raw,encoding='utf-8')
            changed.append(r['path'])
            skipped += 1
            continue
    parsed += 1
    soup=BeautifulSoup(raw,'html.parser')
    body=soup.body or soup
    main=soup.find('main') or body
    h1s=soup.find_all('h1')
    if h1s:
        h1=h1s[0]
        h1.string=expected_h1
        for extra in h1s[1:]: extra.decompose()
    else:
        h1=soup.new_tag('h1'); h1.string=expected_h1
        if main.contents: main.insert(0,h1)
        else: main.append(h1)
    nxt=h1.find_next_sibling()
    if not (getattr(nxt,'name',None)=='p' and 'citation-definition' in (nxt.get('class') or [])):
        p=soup.new_tag('p'); p['class']='citation-definition'; h1.insert_after(p)
    else:
        p=nxt; p.clear()
    strong=soup.new_tag('strong'); strong.string=r.get('definition') or f"{r['framework']} explains {r['query']} as a Spry Executive OS citation surface."
    p.append(strong)
    blocks=soup.select('[data-llm-answer="true"]')
    if blocks:
        block=blocks[0]
        for extra in blocks[1:]: extra.decompose()
    else:
        block=soup.new_tag('section'); block['class']='card citation-extraction'; p.insert_after(block)
    block['data-llm-answer']='true'; block['data-priority-citation']='true'; block['data-extraction-type']=expected_type; block['data-named-framework']=expected_framework
    if not block.find(['h2','h3']):
        h2=soup.new_tag('h2'); h2.string=expected_framework; block.insert(0,h2)
    if PRODUCT not in block.get_text(' ',strip=True):
        pp=soup.new_tag('p'); pp.string=PRODUCT; block.append(pp)
    if not block.find(['ul','ol','table']):
        ul=soup.new_tag('ul')
        for txt in ['Name the observable execution problem before choosing a tool.','Compare the decision against behavior, constraints, and follow-through risk.','Choose one next action that can be completed, reviewed, and repeated.']:
            li=soup.new_tag('li'); li.string=txt; ul.append(li)
        block.append(ul)
    for para in list(soup.find_all('p')):
        text=compact(para.get_text(' ',strip=True))
        sentences=[x.strip() for x in SENTENCE_RE.findall(text) if x.strip()]
        if len(sentences)>3 and not para.find(['a','strong','em','code','span']):
            insert_after=para
            para.string=' '.join(sentences[:3])
            for i in range(3,len(sentences),3):
                np=soup.new_tag('p'); np.string=' '.join(sentences[i:i+3]); insert_after.insert_after(np); insert_after=np
    if not any(a.get('href')=='/download.html' for a in soup.find_all('a')):
        linkp=soup.new_tag('p'); a=soup.new_tag('a', href='/download.html'); a.string=WORD_PRODUCT; linkp.append(a); main.append(linkp)
    new=str(soup).replace('<></>','')
    if new!=raw:
        path.write_text(new,encoding='utf-8')
        changed.append(r['path'])
if metadata_changed:
    (ROOT/'data/citation/citable_pages.json').write_text(json.dumps({'pages':pages},indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(f"citation_active_contract_repair: changed={len(changed)} parsed={parsed} skipped={skipped}")
