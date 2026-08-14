#!/usr/bin/env node
import fs from 'node:fs';
import { readJson, writeJson, stamp, sha256, OK, DEGRADED, UNAVAILABLE } from './lib/core.mjs';

const contract = readJson('data/search_intelligence/search_intelligence_contract.json', {});
const cfg = contract.providers?.grounded_search || {};
const targets = readJson('data/search_intelligence/target_query_set.json', {targets:[]}).targets || [];
const importPath = process.env.SEARCH_OBSERVATIONS_JSON || 'data/search_intelligence/provider_inputs/grounded_search.json';
const apiKey = process.env[cfg.credential_env || 'GEMINI_API_KEY'];
const model = process.env[cfg.model_env || 'SEARCH_INTELLIGENCE_GROUNDING_MODEL'] || cfg.default_model || 'gemini-2.5-flash';
const budget = Math.max(0, Math.min(Number(process.env[cfg.budget_env || 'SEARCH_INTELLIGENCE_DAILY_CALL_BUDGET'] || cfg.default_daily_call_budget || 24), targets.length));
const ownDomains = new Set(contract.public_domains || []);

function domainOf(value) {
  try { return new URL(String(value)).hostname.replace(/^www\./,'').toLowerCase(); } catch {
    const m=String(value||'').match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i); return m?m[1].replace(/^www\./,'').toLowerCase():null;
  }
}
async function observe(t) {
  const endpoint = `${cfg.endpoint}/${model}:generateContent`;
  const body = {contents:[{role:'user',parts:[{text:`Search the web for: "${t.query}". Identify the pages or sources a searcher would actually be pointed to. Use search grounding; do not guess and do not state a numerical rank.`}]}],tools:[{google_search:{}}]};
  const r = await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(body)});
  if(!r.ok){const txt=await r.text();throw new Error(`provider_http_${r.status}:${txt.slice(0,250)}`)}
  const payload=await r.json();const cand=(payload.candidates||[])[0]||{};const grounding=cand.groundingMetadata||{};const refs=[];
  for(const chunk of grounding.groundingChunks||[]){const w=chunk.web||{};const domain=domainOf(w.domain)||domainOf(w.title)||domainOf(w.uri);if(domain)refs.push({domain,title:w.title||null,uri:w.uri||null})}
  const domains=[...new Set(refs.map(x=>x.domain))].sort();const own=refs.filter(x=>ownDomains.has(x.domain));const answer=(cand.content?.parts||[]).map(x=>x.text||'').join('\n');
  return {observation_id:`spry_obs_${sha256(t.target_id+'|'+stamp()).slice(0,12)}`,target_id:t.target_id,query:t.query,status:'OBSERVED',observed_at:stamp(),observation_kind:'grounded_search_observation',is_literal_serp_rank:false,truth_source:cfg.provider_id||'google_genai_grounded_search',model,expected_owned_url:t.expected_owned_url,own_domain_referenced:own.length>0,own_urls_referenced:[...new Set(own.map(x=>x.uri).filter(Boolean))],referenced_domains:domains,references:refs,provider_web_search_queries:grounding.webSearchQueries||[],answer_excerpt:answer.slice(0,900),evidence_ref:`grounded_response_sha256:${sha256(payload)}`,truth_boundary:'Grounded search observation only; not literal Google SERP rank or Search Console performance.'};
}

let observations=[],state=UNAVAILABLE,note=null,attempted=0,failures=0;
if(fs.existsSync(importPath)){
  const d=JSON.parse(fs.readFileSync(importPath,'utf8')); observations=Array.isArray(d)?d:(d.observations||[]); observations=observations.map(x=>({...x,observation_kind:'grounded_search_observation',is_literal_serp_rank:false})); state=OK; note='Imported grounded-search evidence.';
}else if(apiKey && budget>0){
  for(const t of targets.slice(0,budget)){attempted++;try{observations.push(await observe(t))}catch(e){failures++;observations.push({target_id:t.target_id,query:t.query,status:'FAILED',failure_reason:String(e.message||e),observation_kind:'grounded_search_observation',is_literal_serp_rank:false,own_domain_referenced:null,referenced_domains:[]})}}
  state=failures===0?OK:observations.some(x=>x.status==='OBSERVED')?DEGRADED:UNAVAILABLE; note=failures?`${failures}/${attempted} grounded observation calls failed.`:null;
}else note=`No grounded-search credential (${cfg.credential_env||'GEMINI_API_KEY'}) or provider export was available.`;
writeJson('data/search_intelligence/live_search_observations.json',{schema_version:'1.1',generated_at:stamp(),provider_state:state,overall_status:state,status_is_healthy:state===OK,observation_kind:'grounded_search_observation',is_literal_serp_rank:false,budget:{eligible_targets:targets.length,call_budget:budget,calls_attempted:attempted,call_failures:failures},unavailable_note:state===OK?null:note,observations});
console.log(`[search:observe] ${state} observations=${observations.length} attempted=${attempted}`);
