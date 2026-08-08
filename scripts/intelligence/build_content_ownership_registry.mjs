#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
import {readJson,writeJson,now} from '../lib/safe_harbor_utils.mjs';
const manifest=readJson('data/routes/public_route_manifest.json',{routes:[]});
const acceptance=readJson('data/report_fixes/agent_acceptance_manifest.generated.json',{entries:[]});
const paid=new Map();
for(const e of acceptance.entries||[]){const f=String(e.implementation_path||e.intended_winner_path||'').replace(/^\//,''); if(f) paid.set(f,{run_date:e.run_date,record_id:e.record_id,query:e.query});}
const core=new Set(['download.html','product.html','about.html','methodology.html','admin.html','admin/index.html']);
const routes=(manifest.routes||[]).map(r=>{const source=String(r.source_file||'').replace(/^\//,''); const hit=paid.get(source); let owner='legacy_eligible',policy='safe_harbor'; if(hit){owner='paid_agent';policy='owner_only';} else if(core.has(source)||source.startsWith('functions/')||source.startsWith('admin/')){owner='system_core';policy='system_protected';}
 return {route:r.path,source_file:source,owner,source_run:hit?.run_date||null,source_record:hit?.record_id||null,semantic_intent_ids:hit?.query?[hit.query]:[],mutation_policy:policy,protected:['paid_agent','system_core'].includes(owner)};});
writeJson('data/content_ownership_registry.json',{schema_version:'1.0',generated_at:now(),route_count:routes.length,summary:routes.reduce((a,r)=>(a[r.owner]=(a[r.owner]||0)+1,a),{}),routes});
console.log(`[ownership:build] PASS routes=${routes.length} paid=${routes.filter(r=>r.owner==='paid_agent').length}`);
