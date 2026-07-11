#!/usr/bin/env python3
import sys
sys.dont_write_bytecode=True
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'citation'))
from bs4 import BeautifulSoup
from extraction_contract import *
ROOT=Path.cwd();target='insights/how-to-end-the-day-so-tomorrow-starts-fast.html';p=ROOT/target
row=next(x for x in json.loads((ROOT/'data/citation/citable_pages.json').read_text())['pages'] if x['path']==target)
s=BeautifulSoup(p.read_text(errors='ignore'),'html.parser');b=s.select_one('[data-llm-answer="true"]');ok,reason,d=validate_extraction(target,b,row['extraction_type']);graph,err=schema_graph(s)
receipt={'path':target,'stage':'final-before-validation','h1':clean(s.h1.get_text(' ',strip=True)),'extraction_type':b.get('data-extraction-type'),'extraction_block':str(b),'extraction_headings':[clean(h.get_text(' ',strip=True)) for h in b.find_all(['h2','h3','h4'])],'article_headings':[clean(h.get_text(' ',strip=True)) for h in s.find_all(['h2','h3','h4']) if b not in h.parents],'registry_query':row.get('query'),'page_admission_type':row.get('extraction_type'),'schema_types':[n.get('@type') for n in graph],'valid':ok,'reason':reason}
out=ROOT/'artifacts/validation/extraction-pipeline-trace.json';out.write_text(json.dumps(receipt,indent=2)+'\n');print('[trace:extraction-pipeline] PASS')
