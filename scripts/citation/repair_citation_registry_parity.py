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

def norm(v):
    return ' '.join(str(v or '').split()).casefold()

manual=load('data/content/manual_expansion_pages.json',{'pages':[]}).get('pages',[])
# Path-level source of truth for pages with exact acceptance contracts.
updates={}
# data/citation/agent_page_specs.json is the curated authority for `framework`
# and `definition`. It reached the published HTML - apply_citation_program.py
# restores both from it after every spec merge - but it had no path into
# citable_pages.json outside a full build, and this repair only ever read
# manual_expansion_pages.json. So a corrected curated name landed on the page
# while the registry kept the definition derived from the OLD query-shaped
# name, and validate:citation-contract read the disagreement as
# "visible definition/registry drift".
#
# That is why Daily Citation Intelligence stayed red after the framework-name
# authority fix merged (run 33343698923):
#   insights/a-simple-knowledge-system-capture-distill-use.html:
#     page  <strong> "The Capture-Distill-Use Knowledge Framework is a
#                     three-stage system for turning raw information into
#                     reusable decisions, notes, and actions."
#     registry        "A simple knowledge system: capture -> distill -> use -
#                     Spry Executive OS vs productivity apps is addressed with
#                     a direct answer, ..."
# Validate Repo did not catch it because build:all regenerates the registry;
# the daily lane does not build, so only it could see the committed drift.
#
# Only `framework` and `definition` are taken from the curated spec. Canonical
# query ownership is maintained by the query registry, and the comment below
# still holds: this file must not rewrite `query` from a presentation source.
# Both sections carry curated names. `priority_pages` is where the four pages
# that took this lane red are curated, so reading only `new_pages` would leave
# the exact drift this repair exists to close.
curated_spec=load('data/citation/agent_page_specs.json',{})
curated={}
for section in ('new_pages','priority_pages'):
    block=curated_spec.get(section) or {}
    if isinstance(block,dict): curated.update(block)
for path,spec in curated.items():
    fields={k:spec[k] for k in ('framework','definition') if spec.get(k)}
    if fields: updates[path]=fields
# manual_expansion_pages.json is merged last in apply_citation_program.py and
# legitimately outranks the curated spec. Applying it second reproduces that
# precedence here rather than inventing a second, conflicting one.
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
seen_canonical={}
for rec in citable.get('pages',[]):
    if rec.get('status','ACTIVE')!='ACTIVE': continue
    canonical=norm(rec.get('canonical_url'))
    if not canonical: continue
    if canonical in seen_canonical:
        rec['status']='EXCLUDED'
        rec['exclusion_reason']=f"duplicate canonical URL; kept {seen_canonical[canonical]}"
        changed+=1
    else:
        seen_canonical[canonical]=rec.get('path')
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
