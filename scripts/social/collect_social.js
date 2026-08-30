#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const REGISTRY = path.join(ROOT, 'data/social/source_registry.json');
const OUT_DIR = path.join(ROOT, 'data/social/runs');
const today = new Date().toISOString().slice(0, 10);
const UA = process.env.SOCIAL_USER_AGENT || 'sprylabs-hpc-social-signal-engine/1.0 contact:info@spryvc.com';
const TIMEOUT_MS = Number(process.env.SOCIAL_FETCH_TIMEOUT_MS || 6000);
const TERM_LIMIT = Number(process.env.SOCIAL_TERM_LIMIT || 3);
const { makeThrottle } = require('./throttle');
const HIGH_INTENT = /(discipline|accountability|life coach|executive coach|decision fatigue|burnout|planning|weekly review|daily plan|juggling|multiple projects|founder|entrepreneur|athlete|mom|parent|consistency|follow through|system|tool|program)/i;

function ensureDir(d){ if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); }
function score(text){ let s=0; if(/coach|accountability|system|program|tool|app/i.test(text)) s+=35; if(/discipline|consistency|follow through|planning|decision fatigue/i.test(text)) s+=30; if(/founder|entrepreneur|athlete|mom|parent|professional|multiple projects/i.test(text)) s+=20; if(/cost|worth it|best|vs|how|what/i.test(text)) s+=15; return Math.min(100,s); }
const throttle = makeThrottle();
async function fetchText(url){ await throttle(); const c=new AbortController(); const t=setTimeout(()=>c.abort(),TIMEOUT_MS); try{ const r=await fetch(url,{headers:{'User-Agent':UA},signal:c.signal}); if(!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); } finally{ clearTimeout(t); } }
function strip(html){ return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim(); }
async function collectYoutube(source){ const out=[]; for(const term of (source.search_terms||[]).slice(0, TERM_LIMIT)){ try{ const html=await fetchText(`https://www.youtube.com/results?search_query=${encodeURIComponent(term)}`); const text=strip(html).slice(0,4000); if(HIGH_INTENT.test(`${term} ${text}`)) out.push({platform:'youtube',source_key:source.source_key,term,title:term,excerpt:text.slice(0,300),score:score(`${term} ${text}`),captured_at:new Date().toISOString()}); }catch(e){ out.push({platform:'youtube',source_key:source.source_key,term,status:'warning_only_fetch_failed',error:String(e.message||e),captured_at:new Date().toISOString()}); } } return out.filter(x=>!x.error && x.score>=60).slice(0,10); }
function collectManual(source){ const p=path.join(ROOT,'data/social/manual_import.json'); if(!fs.existsSync(p)) return []; const j=JSON.parse(fs.readFileSync(p,'utf8')); return (j.items||[]).map((x,i)=>({platform:'manual',source_key:source.source_key,id:`manual_${i}`,score:score(`${x.title||''} ${x.excerpt||''}`),captured_at:new Date().toISOString(),...x})).filter(x=>x.score>=60); }
async function main(){
 ensureDir(OUT_DIR);
 const registry=JSON.parse(fs.readFileSync(REGISTRY,'utf8'));
 const rawSources=Array.isArray(registry.sources)?registry.sources:[];
 const SUPPORTED_PLATFORMS=['youtube','manual'];
 // Three populations, and they must not be collapsed into one "did not match".
 //   malformed              - not an object, or no .platform: the registry is broken
 //   declaredUnimplemented  - an honest record of intent, carrying a reason
 //   activeSources          - implemented, permitted, and expected to collect
 const malformed=rawSources.filter(source => !source || typeof source !== 'object' || !source.platform);
 const shaped=rawSources.filter(source => source && typeof source === 'object' && source.platform);
 const declaredUnimplemented=shaped.filter(source => source.status === 'declared_unimplemented');
 const unexplained=shaped.filter(source =>
   source.status !== 'declared_unimplemented'
   && source.status !== 'inactive'
   && !SUPPORTED_PLATFORMS.includes(source.platform));
 const missingReason=declaredUnimplemented.filter(source => !source.reason);
 const activeSources=shaped
   .filter(source => source.status !== 'inactive' && source.status !== 'declared_unimplemented')
   .filter(source => SUPPORTED_PLATFORMS.includes(source.platform));
 const results=[];
 const health=[];
 for(const source of activeSources){
   try{
     let rows=[];
     if(source.platform==='youtube') rows=await collectYoutube(source);
     else if(source.platform==='manual') rows=collectManual(source);
     results.push(...rows);
     health.push({source_key:source.source_key,platform:source.platform,status:rows.length?'ok':'empty_no_action',count:rows.length});
   }catch(e){
     health.push({source_key:source.source_key,platform:source.platform,status:'warning_only_failed',error:String(e.message||e),count:0});
   }
 }
 // Rule 0, in both directions.
 //
 // The registry used to list its sources as bare strings ("reddit", "forums", ...)
 // while this collector only ever matched objects with a .platform of "youtube" or
 // "manual". Every source failed the filter, activeSources was always empty, and
 // the lane wrote an empty run file and printed a success-shaped line every day -
 // 95 of 96 committed run files hold zero records. Naming that mismatch was right.
 // Leaving the lane red every morning afterwards was not: the mismatch is fixable,
 // and it has been fixed in data/social/source_registry.json.
 //
 // What survives is the discrimination. A registry that has drifted out of contract
 // with this collector is a hard failure. An implemented, permitted source that
 // simply has no operator input yet is a NAMED STOP that exits 0 and says who must
 // act - the same rule the zero-dollar signal lane follows.
 const declared=rawSources.map(s=>typeof s==='string'?s:(s&&s.platform)||'(unnamed)');
 const contractErrors=[];
 if(malformed.length) contractErrors.push(`${malformed.length} registry entr(ies) are not objects with a .platform field: [${malformed.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(', ')}]`);
 if(unexplained.length) contractErrors.push(`${unexplained.length} source(s) declare a platform this collector does not implement and do not say why: [${unexplained.map(x=>x.platform).join(', ')}]. Supported: [${SUPPORTED_PLATFORMS.join(', ')}]. Either implement a collector, or mark the source status "declared_unimplemented" with a reason.`);
 if(missingReason.length) contractErrors.push(`${missingReason.length} source(s) are marked declared_unimplemented without a reason: [${missingReason.map(x=>x.source_key||x.platform).join(', ')}]. An unimplemented source must say why, or it is indistinguishable from a broken one.`);
 if(!shaped.length) contractErrors.push('the registry declares no object-shaped source at all, so this collector can never do work.');
 if(!activeSources.length && !contractErrors.length) contractErrors.push(`no source is both implemented and active. ${declaredUnimplemented.length} source(s) are recorded as declared_unimplemented, which is honest, but the lane then has nothing to collect from. Activate a supported source or implement one of the declared platforms.`);

 const stop_reason=contractErrors.length?{
   code:'NO_SOURCE_MATCHES_COLLECTOR_CONTRACT',
   message:`data/social/source_registry.json is out of contract with this collector: ${contractErrors.join(' | ')}`,
   declared_sources:declared,
   supported_platforms:SUPPORTED_PLATFORMS,
   exit_code:1
 }:(results.length===0?{
   code:'NO_OPERATOR_INPUT',
   message:`${activeSources.length} implemented source(s) [${activeSources.map(s=>s.source_key||s.platform).join(', ')}] ran and collected zero high-intent records. WHO MUST ACT: the repo owner. Supply data/social/manual_import.json with { "items": [...] }, or activate a credentialed source once its terms review exists. Nothing is broken; there is simply no permitted input today. Exiting 0 as a declared stop, not as success.`,
   declared_sources:declared,
   supported_platforms:SUPPORTED_PLATFORMS,
   active_sources:activeSources.map(s=>s.source_key||s.platform),
   declared_unimplemented:declaredUnimplemented.map(s=>({source:s.source_key||s.platform,reason:s.reason})),
   exit_code:0
 }:null);
 const payload={generated_at:new Date().toISOString(),policy:registry.policy,pipeline_role:registry.pipeline_role||'query_discovery_only',records:results,health,stop_reason,source_mode:activeSources.length?'active_sources':'no_active_sources'};
 fs.writeFileSync(path.join(OUT_DIR,`${today}.json`),JSON.stringify(payload,null,2));
 if(stop_reason && stop_reason.exit_code===1){
   console.error(`social:collect STOP ${stop_reason.code}: ${stop_reason.message}`);
   process.exit(1);
 }
 if(stop_reason){
   console.log(`social:collect NAMED STOP ${stop_reason.code}: ${stop_reason.message}`);
   for(const row of stop_reason.declared_unimplemented||[]) console.log(`social:collect   declared but not implemented - ${row.source}: ${row.reason}`);
   process.exit(0);
 }
 console.log(`social:collect wrote ${results.length} high-intent social records`);
 if(health.some(h=>h.status==='warning_only_failed')) console.warn('social:collect warning-only fetch failures present');
}
main().catch(e=>{ console.error(e); process.exit(1); });
