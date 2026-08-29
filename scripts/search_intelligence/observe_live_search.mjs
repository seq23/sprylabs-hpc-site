#!/usr/bin/env node
import fs from 'node:fs';
import { readJson, writeJson, stamp, sha256, OK, DEGRADED, UNAVAILABLE } from './lib/core.mjs';
import { citationRefs, answerText } from '../lib/openrouter_web_citations.mjs';
// OpenRouter bills the web plugin per REQUEST on the parallel engine with 10
// results included - measured at $0.00127/call on this account against ~$0.04
// on the default engine's per-result billing. Identical url_citation schema.
const WEB_ENGINE = process.env.OPENROUTER_WEB_ENGINE || 'parallel';
const WEB_MODE = process.env.OPENROUTER_WEB_MODE || 'turbo';

const contract = readJson('data/search_intelligence/search_intelligence_contract.json', {});
const cfg = contract.providers?.grounded_search || {};
const targets = readJson('data/search_intelligence/target_query_set.json', {targets:[]}).targets || [];
const importPath = process.env.SEARCH_OBSERVATIONS_JSON || 'data/search_intelligence/provider_inputs/grounded_search.json';
// Repointed from Google GenAI grounded search to OpenRouter's web plugin.
//
// The Gemini path is hard-blocked on this project's key: plain generateContent
// returns 200, the identical call carrying tools:[{google_search:{}}] returns
// 429 RESOURCE_EXHAUSTED, reproduced across three models and persistent. This
// lane consequently recorded calls_attempted: 0 with "No grounded-search
// credential was available" - which is not the same statement as "we are not
// cited", and was read downstream as though it were. The provider now used
// answers and returns the pages the answer was built from as
// choices[0].message.annotations[].url_citation.url.
const apiKey = process.env[cfg.credential_env || 'OPENROUTER_API_KEY'];
const model = process.env[cfg.model_env || 'SEARCH_INTELLIGENCE_GROUNDING_MODEL'] || cfg.default_model || 'openai/gpt-4o-mini';
const WEB_PLUGIN = cfg.request_shape?.plugins || [{id:'web', engine: WEB_ENGINE, mode: WEB_MODE,max_results:10}];
const budget = Math.max(0, Math.min(Number(process.env[cfg.budget_env || 'SEARCH_INTELLIGENCE_DAILY_CALL_BUDGET'] || cfg.default_daily_call_budget || 24), targets.length));
const ownDomains = new Set(contract.public_domains || []);

function domainOf(value) {
  try { return new URL(String(value)).hostname.replace(/^www\./,'').toLowerCase(); } catch {
    const m=String(value||'').match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i); return m?m[1].replace(/^www\./,'').toLowerCase():null;
  }
}
async function observe(t) {
  const body = {
    model,
    plugins: WEB_PLUGIN,
    temperature: 0,
    messages: [{role:'user', content:`Search the web for: "${t.query}". Identify the pages or sources a searcher would actually be pointed to. Use live web results; do not guess and do not state a numerical rank.`}]
  };
  const r = await fetch(cfg.endpoint || 'https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${apiKey}`},body:JSON.stringify(body)});
  if(!r.ok){const txt=await r.text();throw new Error(`provider_http_${r.status}:${txt.slice(0,250)}`)}
  const payload=await r.json();
  const refs=citationRefs(payload);
  const domains=[...new Set(refs.map(x=>x.domain))].sort();const own=refs.filter(x=>ownDomains.has(x.domain));const answer=answerText(payload);
  return {observation_id:`spry_obs_${sha256(t.target_id+'|'+stamp()).slice(0,12)}`,target_id:t.target_id,query:t.query,status:'OBSERVED',observed_at:stamp(),observation_kind:'grounded_search_observation',is_literal_serp_rank:false,truth_source:cfg.provider_id||'openrouter_web_plugin',model,expected_owned_url:t.expected_owned_url,own_domain_referenced:own.length>0,own_urls_referenced:[...new Set(own.map(x=>x.uri).filter(Boolean))],referenced_domains:domains,references:refs,provider_web_search_queries:[],answer_excerpt:answer.slice(0,900),evidence_ref:`grounded_response_sha256:${sha256(payload)}`,truth_boundary:'Grounded search observation only; not literal Google SERP rank or Search Console performance.'};
}

// Rotation: selection used to be a literal targets.slice(0, budget), so the same
// first 24 of 120 targets were observed on every run since the lane was written
// and targets 24-119 were unreachable by design. Persist a cursor so the whole
// target set is covered over successive runs.
const CURSOR_PATH='data/search_intelligence/rotation_cursor.json';
function readCursor(){try{const d=JSON.parse(fs.readFileSync(CURSOR_PATH,'utf8'));const n=Number(d.next_index);return Number.isFinite(n)&&n>=0?n:0;}catch{return 0;}}
function selectRotating(all,size){
  if(!all.length||size<=0)return {batch:[],start:0,next:0};
  const start=readCursor()%all.length;
  const batch=[];for(let i=0;i<size;i++)batch.push(all[(start+i)%all.length]);
  return {batch,start,next:(start+size)%all.length};
}
const rotation=selectRotating(targets,budget);

let observations=[],state=UNAVAILABLE,note=null,attempted=0,failures=0;
if(fs.existsSync(importPath)){
  const d=JSON.parse(fs.readFileSync(importPath,'utf8')); observations=Array.isArray(d)?d:(d.observations||[]); observations=observations.map(x=>({...x,observation_kind:'grounded_search_observation',is_literal_serp_rank:false})); state=OK; note='Imported grounded-search evidence.';
}else if(apiKey && budget>0){
  for(const t of rotation.batch){attempted++;try{observations.push(await observe(t))}catch(e){failures++;observations.push({target_id:t.target_id,query:t.query,status:'FAILED',failure_reason:String(e.message||e),observation_kind:'grounded_search_observation',is_literal_serp_rank:false,own_domain_referenced:null,referenced_domains:[]})}}
  state=failures===0?OK:observations.some(x=>x.status==='OBSERVED')?DEGRADED:UNAVAILABLE; note=failures?`${failures}/${attempted} grounded observation calls failed.`:null;
}else note=`No grounded-search credential (${cfg.credential_env||'OPENROUTER_API_KEY'}) or provider export was available. UNTESTED, not disproven: this records that no call was made, and must never be read as evidence about whether these pages are cited.`;
writeJson('data/search_intelligence/live_search_observations.json',{schema_version:'1.1',generated_at:stamp(),provider_state:state,overall_status:state,status_is_healthy:state===OK,observation_kind:'grounded_search_observation',is_literal_serp_rank:false,budget:{eligible_targets:targets.length,call_budget:budget,calls_attempted:attempted,call_failures:failures},rotation:{cursor_path:CURSOR_PATH,window_start:rotation.start,window_size:rotation.batch.length,next_index:rotation.next,target_ids:rotation.batch.map(t=>t.target_id)},unavailable_note:state===OK?null:note,observations});
// Only advance the cursor when this run actually consumed its window, so a run
// that made no calls does not silently skip 24 targets.
if(attempted>0){writeJson(CURSOR_PATH,{schema_version:'1.0',generated_at:stamp(),eligible_targets:targets.length,window_start:rotation.start,window_size:rotation.batch.length,next_index:rotation.next});}
console.log(`[search:observe] ${state} observations=${observations.length} attempted=${attempted} window=${rotation.start}..${(rotation.start+rotation.batch.length-1)%(targets.length||1)}/${targets.length} next=${attempted>0?rotation.next:rotation.start}`);
