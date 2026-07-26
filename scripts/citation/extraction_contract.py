from __future__ import annotations
import json,re,hashlib
from pathlib import Path
from bs4 import BeautifulSoup,Tag

STEP_RE=re.compile(r'^(?:(?:Step|Phase|Block|Stage)\s+)?(\d{1,2})\s*(?:[:.)\-–—]|\))\s*(.+)$',re.I)
CANONICAL_STEP_RE=re.compile(r'^(Step|Phase|Block|Stage)\s+(\d+)(?:\s*[:.)\-–—])?',re.I)
QUESTION_RE=re.compile(r'^(?:Q\s*\d*[:.)-]?\s*)?.+\?$',re.I)
TYPE_ALIASES={'faq':'faq','comparison':'comparison','definition':'definition','concept':'concept','criteria':'criteria','list':'list','answer':'answer','framework':'framework','howto':'howto','decision':'decision','transactional':'transactional'}
SCHEMA_BY_TYPE={'howto':'HowTo','faq':'FAQPage','comparison':'DefinedTerm','definition':'DefinedTerm','concept':'DefinedTerm','criteria':'DefinedTerm','list':'ItemList','answer':'Article','framework':'DefinedTerm','decision':'DefinedTerm','transactional':'Product'}
CONTRACTS={
 'howto':{'minimum_steps':3,'description':'at least three contiguous numbered procedural headings inside the extraction block'},
 'faq':{'minimum_pairs':2,'description':'at least two question-and-answer pairs'},
 'comparison':{'minimum_entities':2,'description':'a comparison table with at least two compared entities and one dimension'},
 'definition':{'description':'a direct definition paragraph with qualifying context'},
 'concept':{'minimum_items':3,'description':'a structured list with at least three substantive items'},
 'criteria':{'minimum_items':3,'description':'criteria heading plus at least three list items'},
 'list':{'minimum_items':3,'description':'a list with at least three substantive items'},
 'answer':{'minimum_words':20,'description':'a direct answer paragraph of at least twenty words'},
 'framework':{'minimum_components':3,'description':'a named framework with at least three components or stages'},
 'decision':{'description':'choice/use guidance with structured criteria'},
 'transactional':{'description':'transactional surface'},
}

def clean(v:str)->str:return ' '.join((v or '').split())
def normalize_type(v:str)->str:return TYPE_ALIASES.get(clean(v).lower(),clean(v).lower())
def canonical_step_parts(text:str):
 text=clean(text);m=CANONICAL_STEP_RE.match(text)
 if m:return int(m.group(2)),clean(text[m.end():]) or text
 m=STEP_RE.match(text)
 return (int(m.group(1)),clean(m.group(2))) if m else None

def _description_after(h:Tag)->str:
 parts=[];node=h.find_next_sibling()
 while node is not None:
  if getattr(node,'name',None) in ['h2','h3','h4']:break
  if getattr(node,'name',None) in ['p','li','blockquote']:
   t=clean(node.get_text(' ',strip=True))
   if t:parts.append(t)
  node=node.find_next_sibling() if hasattr(node,'find_next_sibling') else None
 return clean(' '.join(parts))

def extract_scope_steps(scope:Tag,limit:int=20):
 raw=[]
 for h in scope.find_all(['h2','h3','h4']):
  p=canonical_step_parts(h.get_text(' ',strip=True))
  if p:raw.append({'number':p[0],'title':p[1],'description':_description_after(h),'source_heading':clean(h.get_text(' ',strip=True))})
  if len(raw)>=limit:break
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

def extract_article_steps(soup:BeautifulSoup,block:Tag|None=None,limit:int=20):
 clone=BeautifulSoup(str(soup),'html.parser')
 for b in clone.select('[data-llm-answer="true"]'):b.decompose()
 steps=extract_scope_steps(clone,limit)
 if steps:return steps
 # Ordered lists under procedural sections are valid article-authored steps.
 for ol in clone.find_all('ol'):
  items=[]
  for li in ol.find_all('li',recursive=False):
   text=clean(li.get_text(' ',strip=True))
   if not text:continue
   strong=li.find(['strong','b'])
   title=clean(strong.get_text(' ',strip=True)) if strong else clean(re.split(r'[.:—–-]',text,maxsplit=1)[0])
   desc=text[len(title):].lstrip(' .:—–-') if title and text.startswith(title) else text
   items.append({'number':len(items)+1,'title':title or f'Complete action {len(items)+1}','description':desc or text,'source_heading':title or text})
  if len(items)>=3:return items[:limit]
 # Some legacy pages contain numbered prose as text nodes rather than list markup.
 lines=[clean(x) for x in clone.get_text('\n',strip=True).splitlines()]
 numbered=[]
 for line in lines:
  m=re.match(r'^(\d{1,2})[.)]\s+(.+)$',line)
  if not m:continue
  n=int(m.group(1));text=clean(m.group(2))
  if n==1 and numbered:break
  if n!=len(numbered)+1:continue
  title=clean(re.split(r'[.:—–-]',text,maxsplit=1)[0])
  numbered.append({'number':n,'title':title or text,'description':text,'source_heading':line})
  if len(numbered)>=limit:break
 if len(numbered)>=3:return numbered
 return []

def faq_pairs(block:Tag):
 pairs=[]
 for h in block.find_all(['h2','h3','h4']):
  q=clean(h.get_text(' ',strip=True))
  if not QUESTION_RE.match(q):continue
  a=_description_after(h)
  if a:pairs.append((q,a))
 return pairs

def direct_paragraphs(block:Tag):return [clean(p.get_text(' ',strip=True)) for p in block.find_all('p') if clean(p.get_text(' ',strip=True))]
def list_items(block:Tag):return [clean(li.get_text(' ',strip=True)) for li in block.find_all('li') if len(clean(li.get_text(' ',strip=True)).split())>=2]

def extract_scope_procedure_candidates(scope: Tag, limit: int = 12):
    banned=("key criteria","related","source","frequently asked","next step","comparison matrix","direct answer","definition")
    out=[]
    for h in scope.find_all(['h2','h3','h4']):
        title=clean(h.get_text(' ',strip=True))
        if not title or any(title.lower().startswith(x) for x in banned): continue
        description=_description_after(h)
        if not description: continue
        out.append({'number':len(out)+1,'title':title,'description':description,'source_heading':title})
        if len(out)>=limit: break
    return out if len(out)>=3 else []

def validate_extraction(path:str,block:Tag,etype:str):
 t=normalize_type(etype);details={'type':t}
 if t=='howto':
  steps=extract_scope_steps(block);details['steps']=steps
  return len(steps)>=3,'howto requires contiguous Step/Phase/Block/Stage 1..3 headings inside the extraction block',details
 if t=='faq':
  pairs=faq_pairs(block);details['pairs']=pairs
  return len(pairs)>=2,'faq requires at least two question-and-answer pairs',details
 if t=='comparison':
  table=block.find('table');rows=table.find_all('tr') if table else []
  width=max([len(r.find_all(['th','td'])) for r in rows] or [0]);details.update({'rows':len(rows),'columns':width})
  return bool(table and len(rows)>=2 and width>=2),'comparison requires a table with at least two rows and two columns',details
 if t in ('concept','list'):
  items=list_items(block);details['items']=items
  return len(items)>=3,f'{t} requires at least three substantive list items',details
 if t=='criteria':
  items=list_items(block);heads=' '.join(clean(h.get_text(' ',strip=True)).lower() for h in block.find_all(['h2','h3']))
  details['items']=items
  return len(items)>=3 and ('criteria' in heads or 'consider' in heads or 'checklist' in heads),'criteria requires a criteria/considerations heading and at least three items',details
 if t=='definition':
  ps=direct_paragraphs(block);text=ps[0] if ps else '';details['words']=len(text.split())
  return len(text.split())>=15 and any(x in text.lower() for x in (' is ',' means ',' refers to ',' describes ')),'definition requires a direct defining paragraph with qualifying context',details
 if t=='answer':
  ps=direct_paragraphs(block);text=ps[0] if ps else '';details['words']=len(text.split())
  return len(text.split())>=20,'answer requires a direct paragraph of at least twenty words',details
 if t=='framework':
  comps=list_items(block)+[clean(h.get_text(' ',strip=True)) for h in block.find_all(['h3','h4'])]
  comps=[x for x in comps if x];details['components']=comps
  named=bool(block.get('data-named-framework'))
  return named and len(comps)>=3,'framework requires a named framework and at least three components',details
 if t=='decision':
  text=clean(block.get_text(' ',strip=True)).lower();structured=bool(block.find(['ul','ol','table']) or len(block.find_all(['h2','h3']))>=2)
  return bool(structured and any(x in text for x in ('when to use','choose','decision','use this','use '))),'decision requires choice/use guidance and structured criteria',details
 if t=='transactional':return True,'',details
 return False,f'unsupported extraction type: {t or "missing"}',details

def schema_graph(soup:BeautifulSoup):
 script=soup.find('script',id='CITATION_PAGE_SCHEMA')
 if not script:return [],'missing CITATION_PAGE_SCHEMA'
 try:data=json.loads(script.string or script.get_text())
 except Exception as e:return [],f'invalid CITATION_PAGE_SCHEMA: {e}'
 graph=data.get('@graph',[]) if isinstance(data,dict) else []
 if not isinstance(graph,list):return [],'CITATION_PAGE_SCHEMA @graph is not a list'
 return graph,''

def schema_nodes(graph,stype):return [n for n in graph if stype in ([n.get('@type')] if isinstance(n.get('@type'),str) else (n.get('@type') or []))]
def schema_parity(soup:BeautifulSoup,etype:str,extraction_details:dict,expected_schema:str|None=None):
 graph,err=schema_graph(soup)
 if err:return False,err,{'schema_types':[]}
 types=[]
 for n in graph:
  t=n.get('@type');types.extend(t if isinstance(t,list) else ([t] if t else []))
 expected=expected_schema or SCHEMA_BY_TYPE.get(normalize_type(etype))
 details={'schema_types':types,'expected_schema':expected}
 if expected and expected not in types:return False,f'expected schema type {expected} not found',details
 if normalize_type(etype)=='howto':
  nodes=schema_nodes(graph,'HowTo');steps=(nodes[0].get('step') or []) if nodes else []
  visible=len(extraction_details.get('steps') or []);details.update({'schema_steps':len(steps),'visible_steps':visible})
  if len(steps)!=visible:return False,f'HowTo schema step count {len(steps)} does not match extraction step count {visible}',details
 if normalize_type(etype)=='faq':
  nodes=schema_nodes(graph,'FAQPage');pairs=(nodes[0].get('mainEntity') or []) if nodes else []
  visible=len(extraction_details.get('pairs') or []);details.update({'schema_pairs':len(pairs),'visible_pairs':visible})
  if len(pairs)!=visible:return False,f'FAQ schema pair count {len(pairs)} does not match extraction pair count {visible}',details
 return True,'',details

def surface_fingerprint(soup:BeautifulSoup):
 block=soup.select_one('[data-llm-answer="true"]');graph,_=schema_graph(soup)
 payload={'block':str(block) if block else None,'schema':graph}
 return hashlib.sha256(json.dumps(payload,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
