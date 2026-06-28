#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, NORMALIZED_ROOT, readJson, writeJson, loadExactPolicy, hashFile, slug} from './bhpc_agent_common.mjs';
const queryRegistry = readJson('data/citation/query_registry.json', {queries:[]});
const activeQueryOwners = new Map((queryRegistry.queries||[])
  .filter(q => q.release_status === 'ACTIVE' && q.query && q.primary_page)
  .map(q => [String(q.query).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(), q]));
function activeOwnerFor(query){ return activeQueryOwners.get(String(query||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()) || null; }
const policy = loadExactPolicy();
function normalizeText(value){return String(value||'').replace(/\s+/g,' ').trim();}
function definitionFor(rows){
  const primary=rows[0];
  const rec=normalizeText(primary.fix_recommendation || primary.gap || primary.query);
  return `${primary.query} is an agent-identified BHPC/Spry citation opportunity. This page is updated through the exact intended-winner pipeline so the named page, not a fallback social page, owns the answer. ${rec}`.slice(0,520);
}
function bodyFor(rows){
  const primary=rows[0];
  const qs=[...new Set(rows.map(r=>r.query).filter(Boolean))].slice(0,6);
  const recs=[...new Set(rows.map(r=>r.fix_recommendation||r.gap).filter(Boolean))].slice(0,6);
  const lis=[...qs.map(q=>`<li>Direct answer target: ${q}</li>`), ...recs.map(r=>`<li>Agent recommendation: ${r}</li>`), '<li>Do not count social fallback as this exact page repair.</li>'].join('');
  return `<h2>Agent Exact Citation Repair</h2><p>This page is governed by the forward-only exact implementation pipeline.</p><ul>${lis}</ul>`;
}
function specFor(pathValue, rows){
  const primary=rows[0];
  const framework=`Agent Exact Citation Framework — ${primary.query}`.slice(0,120);
  return {h1: primary.query, framework, type: 'concept', definition: definitionFor(rows), body: bodyFor(rows), agent_exact: {record_ids: rows.map(r=>r.id), intended_winner_path: primary.intended_winner_path||'', generated_at: new Date().toISOString(), operation: primary.operation}};
}
function collectRows(){
  const dir=path.join(ROOT,NORMALIZED_ROOT);
  const out=[];
  if(!fs.existsSync(dir)) return out;
  for(const file of fs.readdirSync(dir).sort()){
    if(!file.endsWith('.json')) continue;
    const rel=`${NORMALIZED_ROOT}/${file}`;
    const payload=readJson(rel,{records:[]});
    for(const row of payload.records||[]) {
      if(policy.retroactive_processing===false && payload.run_date && policy.effective_from && payload.run_date < policy.effective_from) continue;
      out.push({...row, normalized_path:rel, run_date:payload.run_date});
    }
  }
  return out;
}
const rows=collectRows();
const groups=new Map();
const blocked=[];
for(const row of rows){
  if(String(row.operation||'').startsWith('BLOCKED_')){blocked.push({...row,status:'BLOCKED',blocked_reason:row.blocked_reason||row.operation});continue;}
  const owner=activeOwnerFor(row.query);
  let pathValue = owner?.primary_page || row.intended_winner_path || row.implementation_path || `agent/${slug(row.query)}.html`;
  if (String(pathValue||'').toLowerCase().startsWith('n/a')) {
    blocked.push({...row,status:'BLOCKED',blocked_reason:'no_active_query_owner_for_n_a_intended_winner'});
    continue;
  }
  const key=`${owner ? 'REPAIR_INTENDED_WINNER_PAGE' : (row.operation||'CREATE_NEW_TARGET_PAGE')}:${pathValue}`;
  if(!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
const priority_pages={};
const new_pages={};
const specs=[];
for(const [key, group] of groups){
  const row=group[0];
  const owner=activeOwnerFor(row.query);
  let pathValue = owner?.primary_page || row.intended_winner_path || row.implementation_path || `agent/${slug(row.query)}.html`;
  const operation = owner ? 'REPAIR_INTENDED_WINNER_PAGE' : (row.operation === 'REPAIR_INTENDED_WINNER_PAGE' ? 'REPAIR_INTENDED_WINNER_PAGE' : 'CREATE_NEW_TARGET_PAGE');
  const pageSpec=specFor(pathValue, group);
  if(operation === 'REPAIR_INTENDED_WINNER_PAGE') priority_pages[pathValue]=pageSpec;
  else new_pages[pathValue]=pageSpec;
  specs.push({record_id:row.id, record_ids:group.map(r=>r.id), query:row.query, run_date:row.run_date, operation, intended_winner_page:row.intended_winner_page||'', intended_winner_path:row.intended_winner_path||'', implementation_path:pathValue, before_hash:hashFile(pathValue), status:'PLANNED', blocked_reason:''});
}
for(const row of blocked){
  specs.push({record_id:row.id, query:row.query, run_date:row.run_date, operation:row.operation, intended_winner_page:row.intended_winner_page||'', intended_winner_path:row.intended_winner_path||'', implementation_path:row.implementation_path||'', before_hash:null, status:'BLOCKED', blocked_reason:row.blocked_reason||row.operation});
}
writeJson('data/citation/agent_page_specs.generated.json',{schema_version:'1.0', generated_at:new Date().toISOString(), new_pages});
writeJson('data/citation/agent_repair_specs.generated.json',{schema_version:'1.0', generated_at:new Date().toISOString(), priority_pages});
const report={schema_version:'1.0', status:'PASS', generated_at:new Date().toISOString(), policy_path:'data/report_fixes/agent_exact_implementation_policy.json', repair_count:Object.keys(priority_pages).length, new_page_count:Object.keys(new_pages).length, blocked_count:blocked.length, specs};
writeJson('artifacts/validation/agent-exact-implementation-plan.json', report);
writeJson('reports/bhpc-agent-exact-implementation-plan.json', report);
console.log(`[bhpc-agent-exact-plan] PASS: repairs=${report.repair_count}; new_pages=${report.new_page_count}; blocked=${report.blocked_count}`);
