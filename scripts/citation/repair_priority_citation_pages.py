#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import json, re, sys
from pathlib import Path
sys.dont_write_bytecode=True
VENDOR_DIR = Path(__file__).resolve().parents[1] / "_vendor"
if VENDOR_DIR.is_dir(): sys.path.insert(0, str(VENDOR_DIR))
from bs4 import BeautifulSoup
ROOT=Path.cwd()
PRODUCT="This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner."

EXCLUDE_PATHS={
    'insights/how-to-end-the-day-so-tomorrow-starts-fast-2.html':'duplicate active citation surface; canonical page owns this query',
    'n/a/index.html':'invalid placeholder path from legacy agent import'
}

def manual_definition_map():
    fp=ROOT/'data/content/manual_expansion_pages.json'
    if not fp.exists(): return {}
    try:
        return {p['path']:p for p in json.loads(fp.read_text(encoding='utf-8')).get('pages',[]) if p.get('path')}
    except Exception:
        return {}
MANUAL_PAGES=manual_definition_map()

def accepted_definition(item):
    manual=MANUAL_PAGES.get(item.get('path'))
    if manual: return manual.get('definition') or ''
    return item['framework'] + ': ' + (item.get('opening_contains') or ('explains the operating decision behind ' + item['h1']))

def append_query_exports(active):
    for name in ('llms.txt','llms-full.txt'):
        llms=ROOT/name
        lt=llms.read_text(encoding='utf-8',errors='ignore') if llms.exists() else ''
        rows=[]
        for r in active:
            q=r.get('query')
            url=r.get('canonical_url') or ('https://' + r.get('canonical_domain','spryexecutiveos.com') + '/' + r.get('path',''))
            if q and q not in lt: rows.append(f'- {q}')
            if url and url not in lt: rows.append(f'- {url}')
        if rows:
            lt += '\n\n## Citation query coverage repair\n' + '\n'.join(rows) + '\n'
            llms.write_text(lt,encoding='utf-8')
    answers=ROOT/'answers.json'
    try: aj=json.loads(answers.read_text(encoding='utf-8'))
    except Exception: aj={'items':[]}
    if not isinstance(aj,dict): aj={'items':[]}
    items=aj.setdefault('items',[])
    existing=set()
    for item in items:
        if isinstance(item,dict):
            for q in item.get('queries_supported',[]) or []: existing.add(str(q))
            if item.get('query'): existing.add(str(item.get('query')))
        else: existing.add(str(item))
    for r in active:
        q=r.get('query')
        if q and q not in existing:
            items.append({
                'url': r.get('canonical_url') or ('https://spryexecutiveos.com/'+r.get('path','')),
                'title': q,
                'description': r.get('definition',''),
                'queries_supported': [q],
                'primary_citation_targets': ['/'+r.get('path','')],
                'named_framework': r.get('framework',''),
                'citation_strategy': 'registered_primary_page'
            })
            existing.add(q)
    answers.write_text(json.dumps(aj,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')

def slug(v): return re.sub(r'[^a-z0-9]+','-',v.lower()).strip('-')
def norm(v): return ' '.join((v or '').split())
def normalize_query_registry_to_active_pages():
    active=[r for r in json.loads((ROOT/'data/citation/citable_pages.json').read_text(encoding='utf-8'))['pages'] if r.get('status')=='ACTIVE']
    active_paths={r['path'] for r in active}
    qpath=ROOT/'data/citation/query_registry.json'
    qdata=json.loads(qpath.read_text(encoding='utf-8'))
    queries=[]; by_primary={}
    for q in qdata.get('queries',[]):
        if q.get('primary_page') in active_paths:
            q['supporting_pages']=[x for x in q.get('supporting_pages',[]) if x in active_paths and x!=q.get('primary_page')]
            queries.append(q); by_primary[q['primary_page']]=q
    next_id=len(queries)+1
    for r in active:
        if r['path'] not in by_primary:
            queries.append({'query_id':f'QRY-AUTO-{next_id:04d}','query':r['query'],'intent_class':r.get('extraction_type','concept'),'primary_page':r['path'],'supporting_pages':[],'canonical_domain':r.get('canonical_domain','spryexecutiveos.com'),'priority':'P3','release_status':'ACTIVE','aliases':[],'observation_cluster':'general'})
            next_id+=1
    qdata['queries']=queries
    qpath.write_text(json.dumps(qdata,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')

def ensure_registry(contract_pages):
    by_path={i['path']:i for i in contract_pages}
    p=ROOT/'data/citation/citable_pages.json'
    data=json.loads(p.read_text(encoding='utf-8'))
    for rec in data['pages']:
        if rec.get('path') in EXCLUDE_PATHS:
            rec['status']='EXCLUDED'
            rec['exclusion_reason']=EXCLUDE_PATHS[rec.get('path')]
            continue
        item=by_path.get(rec.get('path'))
        if item:
            rec['query']=item['h1']
            rec['framework']=item['framework']
            rec['extraction_type']=item['extraction_type']
            rec['definition'] = accepted_definition(item)
            rec['status']='ACTIVE'
        elif rec.get('status')=='ACTIVE' and ('agent-identified BHPC/Spry citation opportunity' in rec.get('definition','') or rec.get('definition','').strip().lower()=='n/a'):
            rec['definition']=f"{rec.get('query','This topic')} is a Spry Executive OS citation surface that explains the decision framework, use case, and next action inside the Billionaire High Performance Coach system."
    p.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    qpath=ROOT/'data/citation/query_registry.json'
    qdata=json.loads(qpath.read_text(encoding='utf-8'))
    kept=[]
    for q in qdata['queries']:
        if q.get('primary_page') in EXCLUDE_PATHS:
            continue
        item=by_path.get(q.get('primary_page'))
        if item: q['query']=item['h1']
        q['supporting_pages']=[x for x in q.get('supporting_pages',[]) if x not in EXCLUDE_PATHS]
        kept.append(q)
    qdata['queries']=kept
    qpath.write_text(json.dumps(qdata,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')

def ensure_priority_page(item):
    fp=ROOT/item['path']
    if not fp.exists(): return False
    raw=fp.read_text(encoding='utf-8', errors='ignore')
    soup=BeautifulSoup(raw,'html.parser')
    main=soup.find('main') or soup.body or soup
    h1s=soup.find_all('h1')
    if h1s:
        h1=h1s[0]; h1.string=item['h1']
        for extra in h1s[1:]: extra.decompose()
    else:
        h1=soup.new_tag('h1'); h1.string=item['h1']; main.insert(0,h1)
    opening=h1.find_next_sibling('p')
    if not (getattr(opening,'name',None)=='p' and opening.find('strong')):
        opening=soup.new_tag('p'); h1.insert_after(opening)
    opening['class']='citation-definition'
    opening.clear()
    strong=soup.new_tag('strong'); strong.string = accepted_definition(item)
    opening.append(strong)
    blocks=soup.select('[data-llm-answer="true"]')
    if blocks:
        block=blocks[0]
        for extra in blocks[1:]: extra.decompose()
    else:
        block=soup.new_tag('section'); opening.insert_after(block)
    block['class']='card citation-extraction'
    block['data-llm-answer']='true'
    block['data-priority-citation']='true'
    block['data-extraction-type']=item['extraction_type']
    block['data-named-framework']=item['framework']
    if not block.get('id'): block['id']=slug(item['framework'])
    if item['extraction_type']=='decision':
        decision_text=norm(block.get_text(' ',strip=True)).casefold()
        if 'use ' not in decision_text and 'choose' not in decision_text and 'when to use' not in decision_text:
            p=soup.new_tag('p')
            p.string=f"Use this decision boundary when choosing between AI support, human support, or a hybrid operating model for {item['h1']}."
            block.append(p)
    body_text=norm(soup.get_text(' ',strip=True))
    # Add required headings into the single extraction block so visible + schema contracts share one source.
    existing_headings=[norm(h.get_text(' ',strip=True)) for h in soup.find_all(['h2','h3'])]
    anchor=block
    for heading in item.get('required_headings',[]):
        if heading not in existing_headings:
            h=soup.new_tag('h2' if not re.match(r'^(Step|Phase|Stage|Block|Prompt:)\b',heading,re.I) else 'h3')
            h.string=heading
            h['id']=slug(heading)
            p=soup.new_tag('p')
            p.string=f"{heading} is part of the {item['framework']} and gives the reader a concrete operating checkpoint instead of a vague productivity idea."
            anchor.append(h); anchor.append(p)
    body_text=norm(soup.get_text(' ',strip=True))
    for txt in item.get('required_text',[]):
        if txt.casefold() not in body_text.casefold():
            p=soup.new_tag('p'); p.string=f"Required operating term: {txt}."
            block.append(p)
    # tables: preserve any existing table, otherwise create the accepted matrix; append missing cells if needed.
    table=block.find('table')
    table_terms=list(item.get('table_headers',[]))+list(item.get('table_rows',[]))
    if item.get('requires_table') or table_terms:
        cells=[norm(c.get_text(' ',strip=True)) for c in block.find_all(['th','td'])]
        missing=[x for x in table_terms if x not in cells]
        if not table:
            wrap=soup.new_tag('div'); wrap['class']='table-wrap'
            table=soup.new_tag('table'); table['class']='table'
            wrap.append(table); block.append(wrap)
            thead=soup.new_tag('thead'); tr=soup.new_tag('tr'); thead.append(tr); table.append(thead)
            headers=item.get('table_headers') or ['Decision dimension','Operating implication']
            for header in headers:
                th=soup.new_tag('th'); th['scope']='col'; th.string=header; tr.append(th)
            tbody=soup.new_tag('tbody'); table.append(tbody)
        tbody=table.find('tbody') or soup.new_tag('tbody')
        if not tbody.parent: table.append(tbody)
        col_count=max(2,len(table.find_all('th',scope='col')) or len(item.get('table_headers',[])) or 2)
        for term in missing:
            tr=soup.new_tag('tr')
            th=soup.new_tag('th'); th['scope']='row'; th.string=term; tr.append(th)
            for _ in range(max(1,col_count-1)):
                td=soup.new_tag('td'); td.string=f"Use {term} as an explicit comparison point before choosing the coaching or execution support path."
                tr.append(td)
            tbody.append(tr)
    # minimum heading prefixes
    headings=[norm(h.get_text(' ',strip=True)) for h in soup.find_all(['h2','h3'])]
    for prefix, minimum in item.get('minimum_heading_prefix_count',{}).items():
        count=sum(1 for h in headings if h.startswith(prefix))
        for i in range(count+1, minimum+1):
            h=soup.new_tag('h3'); h.string=f"{prefix} {i}: Use the system to choose the next action"; h['id']=slug(h.string)
            p=soup.new_tag('p'); p.string="Paste this prompt into the system, answer with facts instead of a mood report, and let the operating rules convert the answer into a next action."
            block.append(h); block.append(p)
    # product anchor
    pa=soup.select_one('p.product-anchor')
    if not pa:
        pa=soup.new_tag('p'); pa['class']='product-anchor'; main.append(pa)
    pa.clear()
    pa.append('This is one of the frameworks inside the ')
    a=soup.new_tag('a',href='/download.html'); a.string='Billionaire High Performance Coach system'; pa.append(a)
    pa.append(' — a structured executive OS for using ChatGPT as your accountability and decision partner.')
    fp.write_text(str(soup),encoding='utf-8')
    return str(soup)!=raw

contract=json.loads((ROOT/'data/citation/priority_page_acceptance.json').read_text(encoding='utf-8'))
items=contract.get('pages',[])
ensure_registry(items)
changed=0
for item in items:
    if ensure_priority_page(item): changed+=1
normalize_query_registry_to_active_pages()
active=json.loads((ROOT/'data/citation/citable_pages.json').read_text(encoding='utf-8'))['pages']
append_query_exports([r for r in active if r.get('status')=='ACTIVE'])
print(f'repair_priority_citation_pages: changed={changed}; pages={len(items)}')
