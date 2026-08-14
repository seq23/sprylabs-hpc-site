#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {readJson,writeJson,stamp,ownerMap,PUBLIC} from './lib/core.mjs';

const ROOT=process.cwd();
const errors=[];
const contract=readJson('data/search_intelligence/search_intelligence_contract.json',{});
const targets=readJson('data/search_intelligence/target_query_set.json',{targets:[]});
const repairs=readJson('data/search_intelligence/repair_candidates.json',{candidates:[]});
const owners=ownerMap();

if(!contract.hard_rules?.agent_lane_is_never_writable) errors.push('missing agent exclusion law');
if(!contract.hard_rules?.no_publishing_cadence_change) errors.push('missing cadence exclusion law');
if(!contract.repair_policy?.writes_existing_non_agent_pages_only) errors.push('repair policy must be existing non-agent pages only');
if(!contract.repair_policy?.new_urls_forbidden) errors.push('repair policy must forbid new URLs');

for(const c of repairs.candidates||[]){
  const own=owners.get(c.owned_file);
  if(own?.owner==='paid_agent'||own?.protected===true) errors.push(`repair targets protected owner:${c.owned_file}`);
  if(!fs.existsSync(path.join(ROOT,c.owned_file||''))) errors.push(`repair target does not exist:${c.owned_file}`);
}
for(const dir of contract.protected_agent_paths||[]){
  if(!fs.existsSync(path.join(ROOT,dir))) errors.push(`protected agent path missing:${dir}`);
}

// Static execution-boundary proof: the search lane may mention protected paths for
// hashing/validation, but it may never invoke agent commands or import agent code.
const scanFiles=[];
function walk(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(m?js|py|ya?ml|json)$/i.test(e.name))scanFiles.push(p)}}
walk(path.join(ROOT,'scripts/search_intelligence'));
scanFiles.push(path.join(ROOT,'.github/workflows/search-intelligence.yml'));
const selfFile=path.resolve(new URL(import.meta.url).pathname);
const forbidden=[
  /(?:node|python3?|bash)\s+scripts\/agent_intake\//,
  /npm\s+run\s+agent:/,
  /(?:from|import)\s+['"][^'"]*agent_intake/,
  /child_process[^\n]*agent_intake/,
  /exec(?:File|Sync)?\([^\n]*agent_intake/,
  /spawn(?:Sync)?\([^\n]*agent_intake/
];
for(const file of scanFiles){
  if(!fs.existsSync(file)||path.resolve(file)===selfFile)continue;
  const text=fs.readFileSync(file,'utf8');
  for(const rx of forbidden){if(rx.test(text))errors.push(`search lane invokes protected AI-agent subsystem:${path.relative(ROOT,file)}`)}
}

const obs=readJson('data/search_intelligence/live_search_observations.json',{});
if(obs.provider_state!=='OK'&&obs.status_is_healthy===true)errors.push('unavailable grounded provider marked healthy');
const g=readJson('data/search_intelligence/gsc_truth.json',{});
if(g.provider_state!=='OK'&&g.status_is_healthy===true)errors.push('unavailable GSC marked healthy');
const targetIds=new Set((targets.targets||[]).map(x=>x.target_id));
if(targetIds.size!==(targets.targets||[]).length)errors.push('duplicate target ids');
for(const t of targets.targets||[]){
  if(t.ownership==='paid_agent')errors.push(`target query mapped to paid-agent surface:${t.target_id}`);
  if(!t.owned_file || !fs.existsSync(path.join(PUBLIC,t.owned_file)))errors.push(`target query missing existing owned file:${t.target_id}`);
}
const out={schema_version:'1.1',generated_at:stamp(),status:errors.length?'FAIL':'PASS',target_count:(targets.targets||[]).length,repair_candidate_count:(repairs.candidates||[]).length,protected_agent_execution_boundary:'ENFORCED',errors};
writeJson('artifacts/validation/search-intelligence.json',out);
console.log(JSON.stringify(out,null,2));process.exit(errors.length?1:0);
