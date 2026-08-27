#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json,re,sys
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path.cwd()
VENDOR=ROOT/'scripts/_vendor'
if VENDOR.is_dir(): sys.path.insert(0,str(VENDOR))
from bs4 import BeautifulSoup
sys.path.insert(0, str(ROOT/'scripts/validation'))
from style_policy import sentence_count_split, paragraph_sentence_severity, paragraph_sentence_message
PRODUCT="This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner."
contract=json.loads((ROOT/'data/citation/agent_recommendation_acceptance.json').read_text(encoding='utf-8'))

# repair:programmatic-registry-owners resolves duplicate query ownership by
# renaming the losing page's query - appending a role qualifier such as
# "(supporting page)" - and rewriting that page's H1, title and schema to match.
# The acceptance contract is a historical record of what the review agent asked
# for, so its `query` keeps the original wording. Comparing the H1 to the
# contract therefore hard-failed a page that a sanctioned repair in the same
# pipeline had just corrected: the pipeline was failing on its own output.
#
# The query registry is what the owner repair writes, so it is the current
# truth for a page's query. Prefer it, and fall back to the contract for any
# page the registry does not carry.
_registry_path=ROOT/'data/citation/query_registry.json'
REGISTRY_QUERY={}
if _registry_path.exists():
    for _row in json.loads(_registry_path.read_text(encoding='utf-8')).get('queries',[]):
        _page=_row.get('primary_page')
        if _page and _row.get('query'): REGISTRY_QUERY[_page]=_row['query']
errors=[]
warnings=[]

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
    for idx,p in enumerate(soup.find_all('p')):
        s=text(p)
        count=sentence_count_split(s)
        severity=paragraph_sentence_severity(count)
        if severity=='FAIL': errors.append(paragraph_sentence_message(path, idx, count)); break
        if severity=='WARN': warnings.append(paragraph_sentence_message(path, idx, count))

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
    for selector in item.get('required_selectors',[]):
        if not soup.select_one(selector): errors.append(f'{path}: required selector missing {selector!r}')
    minimum_source_links=item.get('minimum_source_links',0)
    if minimum_source_links:
        source_links=soup.select('section.sources a[href]')
        if len(source_links)<minimum_source_links: errors.append(f'{path}: source links {len(source_links)} < {minimum_source_links}')
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
    expected=REGISTRY_QUERY.get(path,item['query'])
    if expected!=item['query']:
        warnings.append(f'{path}: query disambiguated to {expected!r} by owner-uniqueness repair (contract records {item["query"]!r})')
    universal(path,soup,expected)

if len(contract.get('skipped',[]))!=5: errors.append('expected exactly 5 owner-approved low-relevance skips')
out=ROOT/'artifacts/diagnostics/container-current/validate-agent-recommendations'; out.mkdir(parents=True,exist_ok=True)
(out/'summary.json').write_text(json.dumps({'status':'FAIL' if errors else 'PASS','fixes':len(contract['fixes']),'opportunities':len(contract['opportunities']),'skipped':len(contract['skipped']),'errors':errors,'warnings':warnings},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if errors:
    print(f'[validate:agent-recommendations] FAIL: {len(errors)} issue(s)',file=sys.stderr)
    for e in errors: print(' - '+e,file=sys.stderr)
    raise SystemExit(1)
if warnings:
    print(f"[validate:agent-recommendations] OK with {len(warnings)} content-quality warning(s): {len(contract['fixes'])} fixes, {len(contract['opportunities'])} opportunity pages, and {len(contract['skipped'])} explicit skips")
else:
    print(f"[validate:agent-recommendations] OK: {len(contract['fixes'])} fixes, {len(contract['opportunities'])} opportunity pages, and {len(contract['skipped'])} explicit skips")
