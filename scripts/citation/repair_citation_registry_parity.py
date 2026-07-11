#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import json, sys
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path.cwd()

def load(path, fallback):
    fp=ROOT/path
    return json.loads(fp.read_text(encoding='utf-8')) if fp.exists() else fallback

def save(path, data):
    (ROOT/path).write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')

manual=load('data/content/manual_expansion_pages.json',{'pages':[]}).get('pages',[])
# Path-level source of truth for pages with exact acceptance contracts.
updates={}
for p in manual:
    updates[p['path']]={'query':p['h1'],'definition':p['definition'],'framework':p['framework'],'extraction_type':p.get('type','concept')}
# Agent recommendations may repair page presentation, but they are not
# authoritative for canonical query ownership. Query ownership is maintained
# by the canonical query registry and explicit manual expansion contracts.

changed=0
citable=load('data/citation/citable_pages.json',{'pages':[]})
for rec in citable.get('pages',[]):
    upd=updates.get(rec.get('path'))
    if not upd: continue
    for k,v in upd.items():
        if v and rec.get(k)!=v:
            rec[k]=v; changed+=1
save('data/citation/citable_pages.json',citable)

queries=load('data/citation/query_registry.json',{'queries':[]})
for rec in queries.get('queries',[]):
    upd=updates.get(rec.get('primary_page'))
    if not upd: continue
    if upd.get('query') and rec.get('query')!=upd['query']:
        rec['query']=upd['query']; changed+=1
save('data/citation/query_registry.json',queries)

frameworks=load('data/citation/framework_registry.json',{'frameworks':[]})
for rec in frameworks.get('frameworks',[]):
    primary=rec.get('primary_url','').split('billionairehighperformancecoach.com/')[-1].lstrip('/')
    upd=updates.get(primary)
    if not upd: continue
    if upd.get('framework') and rec.get('name')!=upd['framework']:
        rec['name']=upd['framework']; changed+=1
    if upd.get('definition') and rec.get('definition')!=upd['definition']:
        rec['definition']=upd['definition']; changed+=1
save('data/citation/framework_registry.json',frameworks)

print(f'repair_citation_registry_parity: changed={changed}; paths={len(updates)}')
