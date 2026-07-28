#!/usr/bin/env python3
from __future__ import annotations
import json,sys,os,re,html
from pathlib import Path
sys.dont_write_bytecode=True
CITATION_DIR=Path(__file__).resolve().parents[1]/'citation';sys.path.insert(0,str(CITATION_DIR))
from extraction_contract import normalize_type, CONTRACTS, SCHEMA_BY_TYPE
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
TAG_RE=re.compile(r'<[^>]+>')
ATTR_RE=re.compile(r'([A-Za-z0-9_:\-]+)\s*=\s*(["\'])(.*?)\2',re.S)
SCRIPT_RE=re.compile(r'<script\b(?=[^>]*\bid=["\']CITATION_PAGE_SCHEMA["\'])(?=[^>]*\btype=["\']application/ld\+json["\'])[^>]*>(.*?)</script>',re.I|re.S)
HEADING_RE=re.compile(r'<h[2-4]\b[^>]*>(.*?)</h[2-4]>',re.I|re.S)
P_RE=re.compile(r'<p\b[^>]*>(.*?)</p>',re.I|re.S)
LI_RE=re.compile(r'<li\b[^>]*>(.*?)</li>',re.I|re.S)
TR_RE=re.compile(r'<tr\b[^>]*>(.*?)</tr>',re.I|re.S)
TD_RE=re.compile(r'<t[hd]\b[^>]*>',re.I)
STEP_RE=re.compile(r'^(?:(?:Step|Phase|Block|Stage)\s+)?(\d{1,2})\s*(?:[:.)\-–—]|\))\s*(.+)$',re.I)
CANONICAL_STEP_RE=re.compile(r'^(Step|Phase|Block|Stage)\s+(\d+)(?:\s*[:.)\-–—])?',re.I)
QUESTION_RE=re.compile(r'^(?:Q\s*\d*[:.)-]?\s*)?.+\?$',re.I)

def clean(v:str)->str:
 return ' '.join(html.unescape(TAG_RE.sub(' ',v or '')).split())

def attrs(opening:str)->dict:
 return {m.group(1).lower(): html.unescape(m.group(3)) for m in ATTR_RE.finditer(opening)}

def extraction_blocks(raw:str):
 out=[]
 for m in re.finditer(r'<(?P<tag>[a-zA-Z0-9]+)\b(?P<attrs>[^>]*\bdata-llm-answer\s*=\s*["\']true["\'][^>]*)>',raw,re.I|re.S):
  tag=m.group('tag')
  tag_re=re.compile(rf'</?{re.escape(tag)}\b[^>]*>',re.I|re.S)
  depth=1; end_pos=len(raw)
  for tm in tag_re.finditer(raw,m.end()):
   tok=tm.group(0)
   if tok.startswith('</'):
    depth-=1
    if depth==0:
     end_pos=tm.start(); break
   elif not tok.rstrip().endswith('/>'):
    depth+=1
  out.append((m.group(0),raw[m.end():end_pos]))
 return out

def schema_graph(raw:str):
 m=SCRIPT_RE.search(raw)
 if not m:return [],'missing CITATION_PAGE_SCHEMA'
 try:data=json.loads(html.unescape(m.group(1)).strip())
 except Exception as e:return [],f'invalid CITATION_PAGE_SCHEMA: {e}'
 graph=data.get('@graph',[]) if isinstance(data,dict) else []
 if not isinstance(graph,list):return [],'CITATION_PAGE_SCHEMA @graph is not a list'
 return graph,''

def schema_types(graph):
 types=[]
 for n in graph:
  if not isinstance(n,dict):continue
  t=n.get('@type')
  if isinstance(t,list):types.extend(t)
  elif t:types.append(t)
 return types

def nodes(graph,stype):
 return [n for n in graph if isinstance(n,dict) and stype in ([n.get('@type')] if isinstance(n.get('@type'),str) else (n.get('@type') or []))]

def step_parts(text:str):
 text=' '.join(text.split())
 m=CANONICAL_STEP_RE.match(text)
 if m:return int(m.group(2)), text[m.end():].strip() or text
 m=STEP_RE.match(text)
 if m:return int(m.group(1)), m.group(2).strip()
 return None

def step_sequence(headings):
 raw=[]
 for h in headings:
  p=step_parts(h)
  if p:raw.append({'number':p[0],'title':p[1],'description':'present','source_heading':h})
 for i,s in enumerate(raw):
  if s['number']!=1:continue
  seq=[s];expected=2
  for later in raw[i+1:]:
   if later['number']==expected:seq.append(later);expected+=1
   elif later['number']==1:break
   elif later['number']<expected:continue
   else:break
  if len(seq)>=3:return seq
 return []

def validate_fast(block:str, opening:str, etype:str):
 t=normalize_type(etype); a=attrs(opening); details={'type':t}
 headings=[clean(x) for x in HEADING_RE.findall(block)]
 paragraphs=[clean(x) for x in P_RE.findall(block) if clean(x)]
 items=[clean(x) for x in LI_RE.findall(block) if len(clean(x).split())>=2]
 block_text=clean(block).lower()
 if t=='howto':
  steps=step_sequence(headings); details['steps']=steps
  return len(steps)>=3,'howto requires contiguous Step/Phase/Block/Stage 1..3 headings inside the extraction block',details
 if t=='faq':
  pairs=[h for h in headings if QUESTION_RE.match(h)]; details['pairs']=[(h,'present') for h in pairs]
  return len(pairs)>=2,'faq requires at least two question-and-answer pairs',details
 if t=='comparison':
  rows=TR_RE.findall(block); width=max([len(TD_RE.findall(r)) for r in rows] or [0]); details.update({'rows':len(rows),'columns':width})
  return bool(rows and len(rows)>=2 and width>=2),'comparison requires a table with at least two rows and two columns',details
 if t in ('concept','list'):
  details['items']=items
  return len(items)>=3,f'{t} requires at least three substantive list items',details
 if t=='criteria':
  details['items']=items; htext=' '.join(headings).lower()
  return len(items)>=3 and any(x in htext for x in ('criteria','consider','checklist')),'criteria requires a criteria/considerations heading and at least three items',details
 if t=='definition':
  text=paragraphs[0] if paragraphs else ''; details['words']=len(text.split())
  return len(text.split())>=15 and any(x in text.lower() for x in (' is ',' means ',' refers to ',' describes ')),'definition requires a direct defining paragraph with qualifying context',details
 if t=='answer':
  text=paragraphs[0] if paragraphs else ''; details['words']=len(text.split())
  return len(text.split())>=20,'answer requires a direct paragraph of at least twenty words',details
 if t=='framework':
  comps=items+[h for h in headings if h]; details['components']=comps
  return bool(a.get('data-named-framework')) and len(comps)>=3,'framework requires a named framework and at least three components',details
 if t=='decision':
  structured=bool(re.search(r'<(?:ul|ol|table)\b',block,re.I) or len(headings)>=2)
  return bool(structured and any(x in block_text for x in ('when to use','choose','decision','use this','use '))),'decision requires choice/use guidance and structured criteria',details
 if t=='transactional':return True,'',details
 return False,f'unsupported extraction type: {t or "missing"}',details

cache_hits=0;cache_misses=0
for row in pages:
 path=row.get('path');etype=normalize_type(row.get('extraction_type'))
 if path in {'index.html','download.html'}:continue
 if not path or not etype:continue
 cached=cache_lookup(path,row,'extraction-final-state')
 if cached:
  cache_hits+=1;cr=cached.get('result',{});rows.append(cr.get('row',{}));warnings.extend(cr.get('warnings',[]));continue
 cache_misses+=1
 fp=ROOT/path
 diag={'path':path,'declared_type':etype,'expected_structure':CONTRACTS.get(etype,{}),'registry_type':etype,'schema_type_expected':row.get('schema_type') or SCHEMA_BY_TYPE.get(etype)}
 if not fp.exists():errors.append({**diag,'error':'file missing'});continue
 raw=fp.read_text(encoding='utf-8',errors='ignore')
 blocks=extraction_blocks(raw)
 if len(blocks)!=1:errors.append({**diag,'error':f'expected one extraction block, found {len(blocks)}'});continue
 opening,block=blocks[0];observed=normalize_type(attrs(opening).get('data-extraction-type',''));diag['observed_type']=observed
 ok,reason,details=validate_fast(block,opening,etype);diag['observed_structure']=details
 if observed!=etype:errors.append({**diag,'error':f'page declares {observed}, registry declares {etype}'})
 if not ok:errors.append({**diag,'error':reason,'likely_source_script':'scripts/citation/apply_citation_program.py or a later HTML mutation'})
 graph,err=schema_graph(raw)
 types=schema_types(graph) if not err else []
 expected=row.get('schema_type') or SCHEMA_BY_TYPE.get(etype)
 schema_details={'schema_types':types,'expected_schema':expected}
 schema_ok=not err and (not expected or expected in types)
 schema_reason=err or ('' if schema_ok else f'expected schema type {expected} not found')
 if schema_ok and etype=='howto':
  how=nodes(graph,'HowTo'); steps=(how[0].get('step') or []) if how else []
  visible=len(details.get('steps') or []); schema_details.update({'schema_steps':len(steps),'visible_steps':visible})
  schema_ok=len(steps)==visible; schema_reason='' if schema_ok else f'HowTo schema step count {len(steps)} does not match extraction step count {visible}'
 if schema_ok and etype=='faq':
  faq=nodes(graph,'FAQPage'); pairs=(faq[0].get('mainEntity') or []) if faq else []
  visible=len(details.get('pairs') or []); schema_details.update({'schema_pairs':len(pairs),'visible_pairs':visible})
  schema_ok=len(pairs)==visible; schema_reason='' if schema_ok else f'FAQ schema pair count {len(pairs)} does not match extraction pair count {visible}'
 diag['schema']=schema_details
 if not schema_ok:errors.append({**diag,'error':schema_reason,'likely_source_script':'scripts/citation/repair_schema_parity.py or extraction normalization order'})
 q=qby.get(path)
 if q and q.get('extraction_type') and normalize_type(q.get('extraction_type'))!=etype:errors.append({**diag,'error':f'query registry extraction_type {q.get("extraction_type")} != {etype}'})
 a=aby.get(path)
 if a:
  av=normalize_type(a.get('extraction_type') or etype)
  if av!=etype:errors.append({**diag,'error':f'page admission type {av} != {etype}'})
 final_row={**diag,'valid':ok and observed==etype and schema_ok};rows.append(final_row)
 if final_row['valid']:
  cache_store(path,row,'extraction-final-state',{'row':final_row,'warnings':[w for w in warnings if w.get('path')==path]})
report={'status':'PASS' if not errors else 'FAIL','audited':len(rows),'errors':errors,'warnings':warnings,'types':{},'rows':rows,'cache':{'hits':cache_hits,'misses':cache_misses}}
for r in rows:report['types'][r['declared_type']]=report['types'].get(r['declared_type'],0)+1
out=(ROOT/f'artifacts/validation/extraction-contract-final-state-shard-{shard_index}.json') if shard_count>1 else (ROOT/'artifacts/validation/extraction-contract-final-state.json')
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n')
if shard_count==1:(ROOT/'artifacts/validation/howto-extraction-audit.json').write_text(json.dumps({'status':'PASS' if not [e for e in errors if e.get('declared_type')=='howto'] else 'FAIL','rows':[r for r in rows if r['declared_type']=='howto'],'errors':[e for e in errors if e.get('declared_type')=='howto']},indent=2)+'\n')
if errors:
 print(f'[validate:extraction-contract-final-state] FAIL: {len(errors)} issue(s)')
 for e in errors[:50]:print(' -',e['path'],e['error'])
 raise SystemExit(1)
print(f"[validate:extraction-contract-final-state] PASS shard {shard_index+1}/{shard_count}: {len(rows)} pages; types={report['types']}; warnings={len(warnings)}; cache_hits={cache_hits}; cache_misses={cache_misses}")
