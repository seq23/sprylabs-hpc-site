#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import json, sys
from pathlib import Path
sys.dont_write_bytecode=True
VENDOR=Path(__file__).resolve().parents[1]/'_vendor'
if VENDOR.is_dir(): sys.path.insert(0,str(VENDOR))
from bs4 import BeautifulSoup
ROOT=Path.cwd()
SPEC=ROOT/'data/content/manual_expansion_pages.json'

def ensure_main(soup):
    main=soup.find('main') or soup.find('article')
    if main: return main
    main=soup.new_tag('main')
    if soup.body: soup.body.append(main)
    else: soup.append(main)
    return main

def repair(page):
    fp=ROOT/page['path']
    if not fp.exists(): return False
    raw=fp.read_text(encoding='utf-8',errors='ignore')
    soup=BeautifulSoup(raw,'html.parser')
    main=ensure_main(soup)
    h1s=soup.find_all('h1')
    if h1s:
        h1=h1s[0]; h1.string=page['h1']
        for extra in h1s[1:]: extra.decompose()
    else:
        h1=soup.new_tag('h1'); h1.string=page['h1']; main.insert(0,h1)
    nxt=h1.find_next_sibling()
    if not (getattr(nxt,'name',None)=='p' and 'citation-definition' in (nxt.get('class') or [])):
        p=soup.new_tag('p'); p['class']='citation-definition'; h1.insert_after(p)
    else:
        p=nxt; p.clear()
    strong=soup.new_tag('strong'); strong.string=page['definition']; p.append(strong)
    blocks=soup.select('[data-llm-answer="true"]')
    if blocks:
        block=blocks[0]
        for extra in blocks[1:]: extra.decompose()
    else:
        block=soup.new_tag('section'); block['class']='card citation-extraction'; p.insert_after(block)
    block['data-llm-answer']='true'
    block['data-priority-citation']='true'
    block['data-named-framework']=page['framework']
    block['data-extraction-type']=page.get('type','concept')
    # Keep the first extraction heading aligned with the named framework unless
    # the page-specific artifact title already owns the block.
    heading=block.find(['h2','h3'])
    if heading and page.get('artifact',{}).get('title') not in heading.get_text(' ',strip=True):
        heading.string=page['framework']
    new=str(soup)
    if new!=raw:
        fp.write_text(new,encoding='utf-8')
        return True
    return False

def main():
    data=json.loads(SPEC.read_text(encoding='utf-8'))
    changed=sum(1 for page in data.get('pages',[]) if repair(page))
    print(f'repair_manual_expansion_parity: changed={changed}')
if __name__=='__main__': main()
