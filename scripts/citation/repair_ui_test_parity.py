#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import json, sys
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path.cwd()

def route_for(path):
    if path=='index.html': return '/'
    if path.endswith('/index.html'): return '/' + path[:-len('/index.html')] + '/'
    return '/' + path

def canonical_for(rec):
    if rec.get('canonical_url'): return rec['canonical_url']
    host=rec.get('canonical_domain') or 'spryexecutiveos.com'
    return 'https://' + host + route_for(rec['path'])

def load(path): return json.loads((ROOT/path).read_text(encoding='utf-8'))
def save(path,data): (ROOT/path).write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
pages=[p for p in load('data/citation/citable_pages.json').get('pages',[]) if p.get('status')=='ACTIVE']
by_path={p['path']:p for p in pages}
public=[]
for i,rec in enumerate(sorted(pages,key=lambda x:x['path']),1):
    public.append({
        'route_id':f'ROUTE-{i:04d}',
        'path':route_for(rec['path']),
        'source_file':rec['path'],
        'canonical_url':canonical_for(rec),
        'canonical_domain':rec.get('canonical_domain') or canonical_for(rec).split('/')[2],
        'h1':rec.get('query',''),
        'framework':rec.get('framework',''),
        'safe_controls':['internal-links'],
        'priority':bool(rec.get('priority'))
    })
save('data/routes/public_route_manifest.json',{'routes':public})
crit=load('data/routes/critical_browser_route_manifest.json')
for route in crit.get('routes',[]):
    rec=by_path.get(route.get('source_file'))
    if not rec: continue
    route['path']=route_for(rec['path'])
    route['canonical_url']=canonical_for(rec)
    route['canonical_domain']=rec.get('canonical_domain') or canonical_for(rec).split('/')[2]
    route['h1']=rec.get('query','')
    route['framework']=rec.get('framework','')
    route['definition']=rec.get('definition','')
    route['extraction_type']=rec.get('extraction_type','')
save('data/routes/critical_browser_route_manifest.json',crit)
print(f'repair_ui_test_parity: public={len(public)} critical={len(crit.get("routes",[]))}')
