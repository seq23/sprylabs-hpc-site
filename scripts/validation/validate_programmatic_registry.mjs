#!/usr/bin/env node
import fs from 'node:fs';
import { fail, pass, writeSummary } from './common.mjs';
const registry=JSON.parse(fs.readFileSync('data/content/page_admission_registry.json','utf8'));
const lanes=JSON.parse(fs.readFileSync('data/content/programmatic_lane_contracts.json','utf8')).lanes||{};
const queries=JSON.parse(fs.readFileSync('data/citation/query_registry.json','utf8')).queries.filter(x=>x.release_status==='ACTIVE'&&!/^reports\/|^coverage\//.test(x.primary_page));
const errors=[]; const paths=new Set(); const primary=new Map();
if(registry.record_count!==registry.records.length) errors.push('record_count mismatch');
for(const r of registry.records){
  for(const f of ['path','route','canonical_domain','generation_lane','admission_level','status','primary_query','intent','framework','unique_atom','artifact_type']) if(r[f]===undefined||r[f]===null) errors.push(`${r.path||'unknown'}: missing ${f}`);
  if(paths.has(r.path)) errors.push(`duplicate path ${r.path}`); paths.add(r.path);
  const key=String(r.primary_query||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  if(primary.has(key)) errors.push(`duplicate primary query ${r.primary_query}: ${primary.get(key)}, ${r.path}`); else primary.set(key,r.path);
  if(!lanes[r.generation_lane]) errors.push(`${r.path}: unknown lane ${r.generation_lane}`);
  if(!['baseline','full'].includes(r.admission_level)) errors.push(`${r.path}: invalid admission_level ${r.admission_level}`);
  if(r.status!=='ADMITTED') errors.push(`${r.path}: registry may contain only ADMITTED public pages`);
  if(!fs.existsSync(r.path)) errors.push(`${r.path}: registered public page missing`);
}
const active=new Set(queries.map(x=>x.primary_page));
for(const p of active) if(!paths.has(p)) errors.push(`${p}: active query owner missing from page admission registry`);
for(const p of paths) if(!active.has(p)) errors.push(`${p}: admission record has no active query owner`);
const manual=JSON.parse(fs.readFileSync('data/content/manual_expansion_pages.json','utf8')).pages;
for(const p of manual){const r=registry.records.find(x=>x.path===p.path); if(!r||r.admission_level!=='full'||r.generation_lane!=='manual') errors.push(`${p.path}: manual reference page not full-admitted`);}
writeSummary('validate-programmatic-registry',{status:errors.length?'FAIL':'PASS',records:registry.records.length,active_queries:active.size,lanes:Object.keys(lanes).length,errors});
if(errors.length) fail(`[validate:programmatic-registry] FAIL: ${errors.length} issue(s)`,errors.slice(0,200));
pass(`[validate:programmatic-registry] OK: ${registry.records.length} active pages registered across ${Object.keys(lanes).length} lanes`);
