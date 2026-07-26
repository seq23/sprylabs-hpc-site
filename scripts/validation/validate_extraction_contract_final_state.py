#!/usr/bin/env python3
from __future__ import annotations
import json,sys,os
from pathlib import Path
sys.dont_write_bytecode=True
VENDOR_DIR=Path(__file__).resolve().parents[1]/'_vendor'
if VENDOR_DIR.is_dir():sys.path.insert(0,str(VENDOR_DIR))
CITATION_DIR=Path(__file__).resolve().parents[1]/'citation';sys.path.insert(0,str(CITATION_DIR))
from bs4 import BeautifulSoup
from extraction_contract import *
from cache.page_cache import lookup as cache_lookup, store as cache_store
ROOT=Path.cwd();errors=[];warnings=[];rows=[]
pages_payload=json.loads((ROOT/'data/citation/citable_pages.json').read_text())
all_pages=[row for row in pages_payload.get('pages',[]) if row.get('status','ACTIVE')=='ACTIVE']
shard_count=max(1,int(os.environ.get('EXTRACTION_FINAL_SHARD_COUNT','1')))
shard_index=int(os.environ.get('EXTRACTION_FINAL_SHARD_INDEX','0'))
pages=[row for idx,row in enumerate(all_pages) if idx % shard_count == shard_index]
queries=json.loads((ROOT/'data/citation/query_registry.json').read_text()).get('queries',[])
qby={q.get('primary_page'):q for q in queries}
admission_path=ROOT/'data/content/page_admission_registry.json';admission=json.loads(admission_path.read_text()) if admission_path.exists() else {}
aby={r.get('path'):r for r in admission.get('pages',[]) if isinstance(r,dict)} if isinstance(admission,dict) else {}
cache_hits=0;cache_misses=0
for row in pages:
 path=row.get('path');etype=normalize_type(row.get('extraction_type'))
 if not path or not etype:continue
 cached=cache_lookup(path,row,'extraction-final-state')
 if cached:
  cache_hits+=1;cr=cached.get('result',{});rows.append(cr.get('row',{}));warnings.extend(cr.get('warnings',[]));continue
 cache_misses+=1
 fp=ROOT/path
 diag={'path':path,'declared_type':etype,'expected_structure':CONTRACTS.get(etype,{}),'registry_type':etype,'schema_type_expected':row.get('schema_type') or SCHEMA_BY_TYPE.get(etype)}
 if not fp.exists():errors.append({**diag,'error':'file missing'});continue
 soup=BeautifulSoup(fp.read_text(encoding='utf-8',errors='ignore'),'lxml');blocks=soup.select('[data-llm-answer="true"]')
 if len(blocks)!=1:errors.append({**diag,'error':f'expected one extraction block, found {len(blocks)}'});continue
 block=blocks[0];observed=normalize_type(block.get('data-extraction-type'));diag['observed_type']=observed
 ok,reason,details=validate_extraction(path,block,etype);diag['observed_structure']=details
 if observed!=etype:errors.append({**diag,'error':f'page declares {observed}, registry declares {etype}'})
 if not ok:errors.append({**diag,'error':reason,'likely_source_script':'scripts/citation/apply_citation_program.py or a later HTML mutation'})
 schema_ok,schema_reason,schema_details=schema_parity(soup,etype,details,row.get('schema_type'));diag['schema']=schema_details
 if not schema_ok:errors.append({**diag,'error':schema_reason,'likely_source_script':'scripts/citation/repair_schema_parity.py or extraction normalization order'})
 q=qby.get(path)
 if q and q.get('extraction_type') and normalize_type(q.get('extraction_type'))!=etype:errors.append({**diag,'error':f'query registry extraction_type {q.get("extraction_type")} != {etype}'})
 a=aby.get(path)
 if a:
  av=normalize_type(a.get('extraction_type') or etype)
  if av!=etype:errors.append({**diag,'error':f'page admission type {av} != {etype}'})
 if etype=='howto':
  article=extract_article_steps(soup,block);visible=details.get('steps') or []
  diag['article_steps']=len(article);diag['extraction_steps']=len(visible);diag['schema_steps']=schema_details.get('schema_steps')
  if any('key criteria' in clean(h.get_text(' ',strip=True)).lower() for h in block.find_all(['h2','h3'])) and len(visible)<3:errors.append({**diag,'error':'generic Key Criteria fallback remains on HowTo page'})
  if visible and any(not clean(s.get('description')) for s in visible):warnings.append({**diag,'warning':'one or more step descriptions are empty'})
 final_row={**diag,'valid':ok and observed==etype and schema_ok};rows.append(final_row)
 if final_row['valid']:
  cache_store(path,row,'extraction-final-state',{'row':final_row,'warnings':[w for w in warnings if w.get('path')==path]})
report={'status':'PASS' if not errors else 'FAIL','audited':len(rows),'errors':errors,'warnings':warnings,'types':{},'rows':rows,'cache':{'hits':cache_hits,'misses':cache_misses}}
for r in rows:report['types'][r['declared_type']]=report['types'].get(r['declared_type'],0)+1
out=(ROOT/f'artifacts/validation/extraction-contract-final-state-shard-{shard_index}.json') if shard_count>1 else (ROOT/'artifacts/validation/extraction-contract-final-state.json');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n')
if shard_count==1:(ROOT/'artifacts/validation/howto-extraction-audit.json').write_text(json.dumps({'status':'PASS' if not [e for e in errors if e.get('declared_type')=='howto'] else 'FAIL','rows':[r for r in rows if r['declared_type']=='howto'],'errors':[e for e in errors if e.get('declared_type')=='howto']},indent=2)+'\n')
if errors:
 print(f'[validate:extraction-contract-final-state] FAIL: {len(errors)} issue(s)')
 for e in errors[:50]:print(' -',e['path'],e['error'])
 raise SystemExit(1)
print(f"[validate:extraction-contract-final-state] PASS shard {shard_index+1}/{shard_count}: {len(rows)} pages; types={report['types']}; warnings={len(warnings)}; cache_hits={cache_hits}; cache_misses={cache_misses}")
