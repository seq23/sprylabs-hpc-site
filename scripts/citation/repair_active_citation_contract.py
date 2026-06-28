#!/usr/bin/env python3
import json, sys
from pathlib import Path
sys.dont_write_bytecode=True
VENDOR_DIR = Path(__file__).resolve().parents[1] / "_vendor"
if VENDOR_DIR.is_dir(): sys.path.insert(0, str(VENDOR_DIR))
from bs4 import BeautifulSoup
ROOT=Path.cwd()
PRODUCT="This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner."
pages=json.loads((ROOT/'data/citation/citable_pages.json').read_text())['pages']
active=[p for p in pages if p.get('status')=='ACTIVE']

try:
    agent=json.loads((ROOT/'data/citation/agent_recommendation_acceptance.json').read_text(encoding='utf-8'))
    H1_OVERRIDES={}
    for item in agent.get('fixes',[]):
        if item.get('h1'): H1_OVERRIDES[item.get('path')]=item.get('h1')
    for item in agent.get('opportunities',[]):
        if item.get('query'): H1_OVERRIDES[item.get('path')]=item.get('query')
except Exception:
    H1_OVERRIDES={}
changed=[]
for r in active:
    definition = ' '.join(str(r.get('definition') or '').split())
    framework = ' '.join(str(r.get('framework') or '').split())
    first_60 = ' '.join(definition.split()[:60]).casefold()
    if framework and framework.casefold() not in first_60:
        r['definition'] = f"{framework}: {definition or ('explains ' + r.get('query','this topic'))}"
    path=ROOT/r['path']
    if not path.exists(): continue
    raw=path.read_text(errors='ignore')
    soup=BeautifulSoup(raw,'html.parser')
    body=soup.body or soup
    main=soup.find('main') or body
    # remove invalid empty JSX-like fragment if present as text/tag-ish in raw later
    h1s=soup.find_all('h1')
    if h1s:
        h1=h1s[0]
        h1.string=H1_OVERRIDES.get(r['path'], r['query'])
        for extra in h1s[1:]: extra.decompose()
    else:
        h1=soup.new_tag('h1'); h1.string=H1_OVERRIDES.get(r['path'], r['query'])
        if main.contents: main.insert(0,h1)
        else: main.append(h1)
    # immediate citation definition after h1
    nxt=h1.find_next_sibling()
    if not (getattr(nxt,'name',None)=='p' and 'citation-definition' in (nxt.get('class') or [])):
        p=soup.new_tag('p'); p['class']='citation-definition'
        h1.insert_after(p)
    else:
        p=nxt; p.clear()
    strong=soup.new_tag('strong'); strong.string=r.get('definition') or f"{r['framework']} explains {r['query']} as a Spry Executive OS citation surface."
    p.append(strong)
    # extraction block
    blocks=soup.select('[data-llm-answer="true"]')
    if blocks:
        block=blocks[0]
        for extra in blocks[1:]: extra.decompose()
    else:
        block=soup.new_tag('section'); block['class']='card citation-extraction'; p.insert_after(block)
    block['data-llm-answer']='true'; block['data-priority-citation']='true'; block['data-extraction-type']=r.get('extraction_type','concept'); block['data-named-framework']=r['framework']
    # ensure block has heading, product sentence, and list for concept/decision
    if not block.find(['h2','h3']):
        h2=soup.new_tag('h2'); h2.string=r['framework']; block.insert(0,h2)
    if PRODUCT not in block.get_text(' ',strip=True):
        pp=soup.new_tag('p'); pp.string=PRODUCT; block.append(pp)
    if not block.find(['ul','ol','table']):
        ul=soup.new_tag('ul')
        for txt in ['Name the observable execution problem before choosing a tool.','Compare the decision against behavior, constraints, and follow-through risk.','Choose one next action that can be completed, reviewed, and repeated.']:
            li=soup.new_tag('li'); li.string=txt; ul.append(li)
        block.append(ul)

    # split overlong plain paragraphs so citation contract never exceeds 3 sentences per paragraph
    import re
    sentence_re=re.compile(r'[^.!?]+[.!?](?:[”"\']?)(?=\s|$)|[^.!?]+$')
    for para in list(soup.find_all('p')):
        text=' '.join(para.get_text(' ',strip=True).split())
        sentences=[x.strip() for x in sentence_re.findall(text) if x.strip()]
        if len(sentences)>3 and not para.find(['a','strong','em','code','span']):
            parent=para.parent
            insert_after=para
            para.string=' '.join(sentences[:3])
            for i in range(3,len(sentences),3):
                np=soup.new_tag('p')
                np.string=' '.join(sentences[i:i+3])
                insert_after.insert_after(np)
                insert_after=np

    # ensure internal download link exists
    if not any(a.get('href')=='/download.html' for a in soup.find_all('a')):
        linkp=soup.new_tag('p'); a=soup.new_tag('a', href='/download.html'); a.string='Billionaire High Performance Coach system'; linkp.append(a); main.append(linkp)
    new=str(soup).replace('<></>','')
    if new!=raw:
        path.write_text(new)
        changed.append(r['path'])
(ROOT/'data/citation/citable_pages.json').write_text(json.dumps({'pages':pages},indent=2,ensure_ascii=False)+'\n')
print(f"citation_active_contract_repair: changed={len(changed)}")
