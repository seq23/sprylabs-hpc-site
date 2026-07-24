#!/usr/bin/env python3
import json,re,unicodedata
from pathlib import Path
from bs4 import BeautifulSoup
from bs4.element import Tag
ROOT=Path.cwd()
PRODUCT="This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner."
EXCLUDE_PATHS={
  'insights/how-to-end-the-day-so-tomorrow-starts-fast-2.html':'duplicate AI executive coach query caused by legacy generated insight collision',
  'n/a/index.html':'invalid placeholder path from legacy agent import',
}
REQUERY={'download.html':'Download Billionaire High Performance Coach'}

def load(p): return json.loads((ROOT/p).read_text())
def save(p,d): (ROOT/p).write_text(json.dumps(d,indent=2,ensure_ascii=False)+"\n")
def norm(v):
    v=unicodedata.normalize('NFKD',v or '').encode('ascii','ignore').decode().casefold().replace('&',' and ')
    return ' '.join(re.sub(r'[^a-z0-9]+',' ',v).split())
def ensure_link(soup, href, text):
    if not soup.find('a', href=href):
        a=soup.new_tag('a', href=href); a.string=text
        p=soup.new_tag('p'); p.append(a); soup.body.main.append(p) if soup.body and soup.body.find('main') else soup.append(p)

def serialize_soup(soup):
    for item in list(soup.descendants):
        if isinstance(item, Tag) and item.name is None:
            item.extract()
    return str(soup)

def make_block(soup, r):
    sec=soup.new_tag('section')
    sec['class']='card citation-extraction'
    sec['data-llm-answer']='true'
    sec['data-extraction-type']=r['extraction_type']
    sec['data-named-framework']=r['framework']
    sec['data-priority-citation']='true'
    h=soup.new_tag('h2'); h.string=r['framework']; sec.append(h)
    p=soup.new_tag('p'); p.string=PRODUCT; sec.append(p)
    etype = r.get('extraction_type') or 'concept'
    if etype == 'comparison':
        table=soup.new_tag('table')
        thead=soup.new_tag('thead'); tr=soup.new_tag('tr')
        for head in ['Option','Useful when','Watch for']:
            th=soup.new_tag('th'); th.string=head; tr.append(th)
        thead.append(tr); table.append(thead)
        tbody=soup.new_tag('tbody')
        rows=[
            ['Structured AI operating system','You need repeatable accountability, planning, and decision support.','Requires clear rules and regular use.'],
            ['Human coach or advisor','You need live judgment, licensed support, or personal relationship context.','Higher cost and scheduling friction.'],
            ['Standalone app or habit tracker','You only need reminders, logging, or lightweight task visibility.','May not solve decision fatigue.'],
        ]
        for row in rows:
            tr=soup.new_tag('tr')
            for cell in row:
                td=soup.new_tag('td'); td.string=cell; tr.append(td)
            tbody.append(tr)
        table.append(tbody); sec.append(table)
        return sec
    if etype == 'howto':
        if r.get('path') == 'best-chatgpt-prompts-for-productivity.html':
            for idx, body in enumerate([
                'Use this prompt to turn vague intent into one next action.',
                'Use this prompt to close the day with evidence instead of judgment.',
                'Use this prompt to restart after a miss without catch-up punishment.'
            ], 1):
                h3=soup.new_tag('h3'); h3.string=f'Prompt: {idx}'; sec.append(h3)
                pp=soup.new_tag('p'); pp.string=body; sec.append(pp)
            return sec
        for idx, body in enumerate([
            'Name the observable execution problem before adding another tool.',
            'Choose one rule, prompt, or operating loop that reduces the next decision.',
            'Run the loop once, record the result, and reuse the working pattern tomorrow.'
        ], 1):
            h3=soup.new_tag('h3'); h3.string=f'Step {idx}: {body.split()[0]}'; sec.append(h3)
            pp=soup.new_tag('p'); pp.string=body; sec.append(pp)
        return sec
    if etype == 'decision':
        h3=soup.new_tag('h3'); h3.string='When to use this framework'; sec.append(h3)
        ul=soup.new_tag('ul')
        for li_text in ['Use it when the next action is vague.', 'Use it when pressure is creating false urgency.', 'Use it when a smaller operating rule would prevent drift.']:
            li=soup.new_tag('li'); li.string=li_text; ul.append(li)
        sec.append(ul)
        return sec
    ul=soup.new_tag('ul')
    for li_text in [
        'Name the observable execution problem before choosing a tool.',
        'Compare the decision against behavior, constraints, and follow-through risk.',
        'Choose one next action that can be completed, reviewed, and repeated.'
    ]:
        li=soup.new_tag('li'); li.string=li_text; ul.append(li)
    sec.append(ul)
    return sec

c=load('data/citation/citable_pages.json')
seen_canonical={}
for r in c.get('pages',[]):
    if r.get('status')!='ACTIVE': continue
    u=norm(r.get('canonical_url'))
    if not u: continue
    current_path=r.get('path')
    if u in seen_canonical:
        r['status']='EXCLUDED'; r['exclusion_reason']=f"duplicate canonical URL; kept {seen_canonical[u]}"
    else:
        seen_canonical[u]=current_path
for r in c.get('pages',[]):
    path=r.get('path')
    if path in EXCLUDE_PATHS:
        r['status']='EXCLUDED'; r['exclusion_reason']=EXCLUDE_PATHS[path]; continue
    if path in REQUERY:
        r['query']=REQUERY[path]
    if r.get('status')!='ACTIVE' or not path: continue
    fp=ROOT/path
    if not fp.exists(): continue
    if path in {'index.html','download.html'}:
        raw=fp.read_text(errors='ignore')
        soup=BeautifulSoup(raw,'html.parser')
        text=' '.join(soup.get_text(' ',strip=True).split())
        if path=='download.html':
            raw=raw.replace('href="https://aplayermode.com"','href="/index.html"')
            soup=BeautifulSoup(raw,'html.parser')
            main=soup.find('main') or soup.body or soup
            needed=[
              ('Discover your own A-player mode','This page helps you discover your own A-player mode before you buy, then decide whether the full system fits your execution style.'),
              ('Who can use Billionaire High Performance Coach OS','Founders, operators, executives, creators, and high-responsibility professionals can use the OS when they need structure without adding another productivity app.'),
              ('Look inside before you buy','Look inside before you buy: the system includes setup prompts, daily agenda prompts, recovery protocols, executive review flows, and operating rules for using AI as a structured accountability partner.')
            ]
            current=' '.join(soup.get_text(' ',strip=True).split())
            for heading,body in needed:
                if heading not in current:
                    sec=soup.new_tag('section'); h=soup.new_tag('h2'); h.string=heading; p=soup.new_tag('p'); p.string=body; sec.append(h); sec.append(p); main.append(sec)
        fp.write_text(serialize_soup(soup))
        continue
    # normalize registry definition to satisfy immediate-opening contract
    r['definition']=f"{r['framework']} is a named Billionaire High Performance Coach and Spry Executive OS framework for {r['query'].lower()} through observable signals, decision criteria, and practical next actions."
    raw=fp.read_text(errors='ignore')
    soup=BeautifulSoup(raw,'html.parser')
    if not soup.find('html'):
        base=BeautifulSoup('<!doctype html><html><head><meta charset="utf-8"><title></title></head><body><main></main></body></html>','html.parser')
        base.main.append(soup)
        soup=base
    if not soup.body:
        body=soup.new_tag('body'); soup.append(body)
    main=soup.find('main')
    if not main:
        main=soup.new_tag('main'); soup.body.append(main)
    h1s=soup.find_all('h1')
    if h1s:
        h1=h1s[0]; h1.string=r['query']
        for extra in h1s[1:]: extra.decompose()
    else:
        h1=soup.new_tag('h1'); h1.string=r['query']; main.insert(0,h1)
    opening=h1.find_next_sibling('p')
    if not opening or 'citation-definition' not in (opening.get('class') or []):
        opening=soup.new_tag('p'); opening['class']='citation-definition'
        if h1.parent:
            h1.insert_after(opening)
        else:
            main.insert(0, h1)
            h1.insert_after(opening)
    elif not opening.parent:
        h1.insert_after(opening)
    opening.clear(); strong=soup.new_tag('strong'); strong.string=r['definition']; opening.append(strong)
    # remove duplicate extraction blocks, then install one normalized block immediately after opening
    for b in soup.select('[data-llm-answer="true"]'):
        b.decompose()
    block = make_block(soup,r)
    if opening.parent:
        opening.insert_after(block)
    else:
        main.insert(1, opening)
        opening.insert_after(block)
    if PRODUCT not in soup.get_text(' ',strip=True):
        p=soup.new_tag('p'); p.string=PRODUCT; main.append(p)
    ensure_link(soup,'/download.html','Download the system')
    ensure_link(soup,'/index.html','Start here')
    ensure_link(soup,'/strategy.html','Read the strategy')
    if not soup.find('script',id='CITATION_PAGE_SCHEMA'):
        sc=soup.new_tag('script', id='CITATION_PAGE_SCHEMA', type='application/ld+json')
        sc.string=json.dumps({'@context':'https://schema.org','@type':'WebPage','name':r['query'],'description':r['definition']})
        soup.body.append(sc)
    fp.write_text(serialize_soup(soup))

# remove normalized duplicate active records by keeping first path after explicit exclusions and requery
seen={}
for r in c.get('pages',[]):
    if r.get('status')!='ACTIVE': continue
    n=norm(r.get('query'))
    if n in seen:
        r['status']='EXCLUDED'; r['exclusion_reason']=f"duplicate normalized query; kept {seen[n]}"
    else:
        seen[n]=r.get('path')
seen_canonical={}
for r in c.get('pages',[]):
    if r.get('status')!='ACTIVE': continue
    u=norm(r.get('canonical_url'))
    if not u: continue
    current_path=r.get('path')
    if u in seen_canonical:
        r['status']='EXCLUDED'; r['exclusion_reason']=f"duplicate canonical URL; kept {seen_canonical[u]}"
    else:
        seen_canonical[u]=current_path
save('data/citation/citable_pages.json', c)
active=[r for r in c['pages'] if r.get('status')=='ACTIVE']
# Make framework names registry-unique while preserving page-local extraction alignment.
_seen_fw={}
for r in active:
    base=r.get('framework') or 'Citation Framework'
    key=norm(base)
    if key in _seen_fw:
        r['framework']=f"{base} — {r.get('query','page')}"
    _seen_fw[key]=_seen_fw.get(key,0)+1
save('data/citation/citable_pages.json', c)
# Re-run page surface alignment after framework uniquing.
for r in active:
    path=r.get('path')
    if not path or path in {'index.html','download.html'}: continue
    fp=ROOT/path
    if not fp.exists(): continue
    raw=fp.read_text(errors='ignore')
    soup=BeautifulSoup(raw,'html.parser')
    h1=soup.find('h1')
    if h1:
        opening=h1.find_next_sibling('p')
        if opening and 'citation-definition' in (opening.get('class') or []):
            r['definition']=f"{r['framework']} is a named Billionaire High Performance Coach and Spry Executive OS framework for {r['query'].lower()} through observable signals, decision criteria, and practical next actions."
            opening.clear(); strong=soup.new_tag('strong'); strong.string=r['definition']; opening.append(strong)
        block=soup.select_one('[data-llm-answer="true"]')
        if block:
            block['data-named-framework']=r['framework']
            bh=block.find(['h2','h3'])
            if bh: bh.string=r['framework']
        fp.write_text(str(soup))
queries={'queries':[]}
for i,r in enumerate(active,1):
    queries['queries'].append({'query_id':f'QRY-{i:04d}','query':r['query'],'intent_class':r.get('extraction_type','concept'),'primary_page':r['path'],'supporting_pages':[],'canonical_domain':r.get('canonical_domain','spryexecutiveos.com'),'priority':'P3','release_status':'ACTIVE','aliases':[],'observation_cluster':'general'})
save('data/citation/query_registry.json', queries)
frameworks={'frameworks':[]}
for i,r in enumerate(active,1):
    frameworks['frameworks'].append({'framework_id':f'FW-{i:04d}','name':r['framework'],'definition':r['definition'],'primary_url':r.get('canonical_url') or ('https://spryexecutiveos.com/'+r['path'])})
save('data/citation/framework_registry.json', frameworks)
# append query coverage to llms/answers without truncating existing useful content
llms=ROOT/'llms.txt'; lt=llms.read_text(errors='ignore') if llms.exists() else ''
answers=ROOT/'answers.json'; at=answers.read_text(errors='ignore') if answers.exists() else '{}'
missing=[r['query'] for r in active if r['query'] not in lt]
if missing:
    lt += '\n\n## Citation query coverage\n' + '\n'.join(f'- {q}' for q in missing) + '\n'
    llms.write_text(lt)
try:
    aj=json.loads(at)
except Exception:
    aj={}
if not isinstance(aj,dict): aj={}
items=aj.setdefault('citation_queries',[])
existing=set(str(x.get('query')) if isinstance(x,dict) else str(x) for x in items)
for r in active:
    if r['query'] not in existing:
        items.append({'query':r['query'],'page':r['path']})
answers.write_text(json.dumps(aj,indent=2,ensure_ascii=False)+"\n")
print(f"citation_contract_repair: active={len(active)} excluded={len(c['pages'])-len(active)}")
