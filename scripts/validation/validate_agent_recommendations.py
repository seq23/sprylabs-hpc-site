#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json,re,sys
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path.cwd()
VENDOR=ROOT/'scripts/_vendor'
if VENDOR.is_dir(): sys.path.insert(0,str(VENDOR))
from bs4 import BeautifulSoup
PRODUCT="This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner."
contract=json.loads((ROOT/'data/citation/agent_recommendation_acceptance.json').read_text(encoding='utf-8'))
errors=[]

def text(x): return ' '.join(x.get_text(' ',strip=True).split()) if x else ''
def section_words(heading):
    words=[]
    for sib in heading.next_siblings:
        if getattr(sib,'name',None) in ('h1','h2'): break
        if hasattr(sib,'get_text'): words.extend(text(sib).split())
    return len(words)

def universal(path,soup,expected_h1=None):
    h1s=soup.find_all('h1')
    if len(h1s)!=1: errors.append(f'{path}: expected one H1, found {len(h1s)}'); return
    h1=text(h1s[0])
    if expected_h1 and h1!=expected_h1: errors.append(f'{path}: H1 mismatch {h1!r}')
    opening=h1s[0].find_next_sibling('p')
    if not opening or not opening.find('strong'): errors.append(f'{path}: immediate bold definition missing')
    blocks=soup.select('[data-llm-answer="true"]')
    if len(blocks)!=1: errors.append(f'{path}: expected one extraction block, found {len(blocks)}')
    product=soup.select_one('p.product-anchor')
    if not product or PRODUCT not in text(product): errors.append(f'{path}: product anchor missing')
    if not product or not product.select_one('a[href="/download.html"]'): errors.append(f'{path}: /download.html anchor missing')
    for p in soup.find_all('p'):
        s=text(p)
        count=len([x for x in re.split(r'(?<=[.!?])(?:[”’\"\']*)\s+',s) if x.strip()])
        if count>3: errors.append(f'{path}: paragraph exceeds 3 sentences: {s[:90]!r}'); break

for item in contract['fixes']:
    path=item['path']; fp=ROOT/path
    if not fp.exists(): errors.append(f'{path}: file missing'); continue
    soup=BeautifulSoup(fp.read_text(encoding='utf-8'),'html.parser')
    if item.get('h1'):
        h1=text(soup.find('h1'))
        if h1!=item['h1']: errors.append(f'{path}: H1 mismatch {h1!r}')
    headings=[text(h) for h in soup.find_all(['h2','h3'])]
    body=text(soup)
    for req in item.get('required_headings',[]):
        if req not in headings: errors.append(f'{path}: missing heading {req!r}')
    for req in item.get('required_text',[]):
        if req.casefold() not in body.casefold(): errors.append(f'{path}: missing text {req!r}')
    for prefix,minn in item.get('minimum_heading_prefix_count',{}).items():
        c=sum(h.startswith(prefix) for h in headings)
        if c<minn: errors.append(f'{path}: heading prefix {prefix!r} count {c} < {minn}')
    cells=[text(x) for x in soup.select('table th,table td')]
    for req in item.get('table_rows',[]):
        if req not in cells: errors.append(f'{path}: missing table row {req!r}')
    for heading,minn in item.get('minimum_list_items_by_heading',{}).items():
        node=next((h for h in soup.find_all(['h2','h3']) if text(h)==heading),None)
        ul=node.find_next_sibling(['ul','ol']) if node else None
        count=len(ul.find_all('li',recursive=False)) if ul else 0
        if count<minn: errors.append(f'{path}: {heading!r} list count {count} < {minn}')
    for heading,minn in item.get('section_min_words',{}).items():
        node=next((h for h in soup.find_all(['h2','h3']) if text(h)==heading),None)
        count=section_words(node) if node else 0
        if count<minn: errors.append(f'{path}: section {heading!r} has {count} words < {minn}')
    if item.get('above_fold_id') and not soup.find(id=item['above_fold_id']): errors.append(f'{path}: above-fold marker missing')
    if item.get('required_bold_heading'):
        node=next((h for h in soup.find_all(['h2','h3']) if text(h)==item['required_bold_heading']),None)
        if not node or not node.find('strong'): errors.append(f'{path}: required bold heading missing')

for item in contract['opportunities']:
    path=item['path']; fp=ROOT/path
    if not fp.exists(): errors.append(f'{path}: opportunity page missing'); continue
    soup=BeautifulSoup(fp.read_text(encoding='utf-8'),'html.parser')
    universal(path,soup,item['query'])

if len(contract.get('skipped',[]))!=5: errors.append('expected exactly 5 owner-approved low-relevance skips')
out=ROOT/'artifacts/diagnostics/container-current/validate-agent-recommendations'; out.mkdir(parents=True,exist_ok=True)
(out/'summary.json').write_text(json.dumps({'status':'FAIL' if errors else 'PASS','fixes':len(contract['fixes']),'opportunities':len(contract['opportunities']),'skipped':len(contract['skipped']),'errors':errors},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if errors:
    print(f'[validate:agent-recommendations] FAIL: {len(errors)} issue(s)',file=sys.stderr)
    for e in errors: print(' - '+e,file=sys.stderr)
    raise SystemExit(1)
print(f"[validate:agent-recommendations] OK: {len(contract['fixes'])} fixes, {len(contract['opportunities'])} opportunity pages, and {len(contract['skipped'])} explicit skips")
