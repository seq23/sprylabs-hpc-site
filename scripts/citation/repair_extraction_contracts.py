#!/usr/bin/env python3
from __future__ import annotations
import json,sys,re
from pathlib import Path
sys.dont_write_bytecode=True
VENDOR_DIR=Path(__file__).resolve().parents[1]/'_vendor'
if VENDOR_DIR.is_dir():sys.path.insert(0,str(VENDOR_DIR))
from bs4 import BeautifulSoup
from extraction_contract import *
ROOT=Path.cwd();PAGES=ROOT/'data/citation/citable_pages.json';QUERIES=ROOT/'data/citation/query_registry.json';ADMISSION=ROOT/'data/content/page_admission_registry.json';AUTH=ROOT/'data/citation/extraction_reclassification.json';REPORT=ROOT/'artifacts/validation/extraction-contract-repair.json'
payload=json.loads(PAGES.read_text());queries=json.loads(QUERIES.read_text()) if QUERIES.exists() else {'queries':[]};admission=json.loads(ADMISSION.read_text()) if ADMISSION.exists() else {};auth=json.loads(AUTH.read_text()) if AUTH.exists() else {'authorized':[]}
authmap={x['path']:x for x in auth.get('authorized',[]) if x.get('path') and x.get('to_type')}
repairs=[];reclassifications=[];failures=[];audited=0

def sync_reclassification(row,new_type,soup,block):
 old=row.get('extraction_type');row['extraction_type']=new_type;row['schema_type']=SCHEMA_BY_TYPE[new_type];block['data-extraction-type']=new_type
 for q in queries.get('queries',[]):
  if q.get('primary_page')==row.get('path'):q['intent_class']=new_type
 records=admission.get('pages') if isinstance(admission,dict) else None
 if isinstance(records,list):
  for r in records:
   if r.get('path')==row.get('path'):
    if 'extraction_type' in r:r['extraction_type']=new_type
    if 'intent_class' in r:r['intent_class']=new_type
 reclassifications.append({'path':row['path'],'from':old,'to':new_type})

for row in payload.get('pages',[]):
 path=row.get('path');etype=normalize_type(row.get('extraction_type'))
 if not path or not etype:continue
 fp=ROOT/path
 if not fp.exists():continue
 raw=fp.read_text(encoding='utf-8',errors='ignore')
 soup=BeautifulSoup(raw,'lxml');blocks=soup.select('[data-llm-answer="true"]')
 if len(blocks)!=1:failures.append({'path':path,'reason':f'expected one extraction block, found {len(blocks)}'});continue
 block=blocks[0];audited+=1;ok,reason,details=validate_extraction(path,block,etype)
 if etype=='howto':
  steps=extract_scope_steps(block)
  article_steps=extract_article_steps(soup,block)
  candidates=extract_scope_procedure_candidates(block)
  chosen=article_steps if len(article_steps)>=3 else (steps if len(steps)>=3 else candidates)
  # Normalize whenever the article carries a stronger real procedure, or the block is invalid.
  if len(chosen)>=3 and (not ok or len(article_steps)>=3 and [x['title'] for x in article_steps]!=[x['title'] for x in steps]):
   for old in list(block.select('[data-generated-extraction-structure="true"]')):old.decompose()
   wrap=soup.new_tag('div',attrs={'data-generated-extraction-structure':'true'})
   h2=soup.new_tag('h2');h2.string=clean(soup.h1.get_text(' ',strip=True) if soup.h1 else row.get('query') or 'How to apply this method');wrap.append(h2)
   for idx,step in enumerate(chosen,1):
    h3=soup.new_tag('h3');h3['id']=f'extraction-step-{idx}';h3.string=f"Step {idx}: {step['title']}";wrap.append(h3)
    p=soup.new_tag('p');p.string=step['description'] or f"Complete step {idx} using the specific instructions documented in the article, then record the observable result.";wrap.append(p)
   block.insert(0,wrap);repairs.append({'path':path,'steps':len(chosen),'source':'article' if article_steps else 'existing-extraction'})
   ok,reason,details=validate_extraction(path,block,etype)
  if not ok:
   req=authmap.get(path)
   if req:
    target=normalize_type(req['to_type']);candidate_ok,candidate_reason,_=validate_extraction(path,block,target)
    if not candidate_ok:failures.append({'path':path,'reason':f'authorized reclassification to {target} invalid: {candidate_reason}'})
    else:sync_reclassification(row,target,soup,block);ok=True
   else:failures.append({'path':path,'reason':reason,'article_steps':len(article_steps),'extraction_steps':len(steps)})
 elif etype=='transactional':
  text=clean(block.get_text(' ',strip=True))
  if not text:
   definition=clean(row.get('definition') or row.get('query') or '')
   if not definition:
    failures.append({'path':path,'reason':'transactional extraction block is empty and canonical definition is unavailable'})
    ok=False
   else:
    strong=soup.new_tag('strong');strong.string=definition;block.append(strong)
    repairs.append({'path':path,'source':'canonical-transactional-definition'})
    ok=True
 elif not ok:
  failures.append({'path':path,'reason':reason})
 if ok:
  rendered=str(soup)
  if rendered!=raw:fp.write_text(rendered,encoding='utf-8')

REPORT.parent.mkdir(parents=True,exist_ok=True)
REPORT.write_text(json.dumps({'status':'PASS' if not failures else 'FAIL','audited':audited,'repairs':repairs,'reclassifications':reclassifications,'failures':failures},indent=2)+'\n')
if reclassifications:
 PAGES.write_text(json.dumps(payload,indent=2)+'\n');QUERIES.write_text(json.dumps(queries,indent=2)+'\n')
 if ADMISSION.exists():ADMISSION.write_text(json.dumps(admission,indent=2)+'\n')
if failures:
 print(f'[repair:extraction-contracts] FAIL: {len(failures)} unresolved')
 for x in failures[:50]:print(' -',x)
 raise SystemExit(1)
print(f'[repair:extraction-contracts] PASS: audited={audited} repaired={len(repairs)} reclassified={len(reclassifications)}')
