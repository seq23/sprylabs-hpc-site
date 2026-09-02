#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';
const fs=require('fs'); const path=require('path');
const { classifyAudience, audienceFrame, AUTHORITY_DOMAIN, CTA_TARGET } = require('../lib/audience_frame');
const { applySignalKeys } = require('../lib/cluster_signal_ledger');
const ROOT=process.cwd();
const INPUTS=['data/community/scored_signals.json','data/social/routed_candidates.json','data/social/runs'];
const OUT='data/community/content_routing_log.json';
const MEMORY='data/content_clusters/cluster_memory.json';
function readJson(p,f){try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return f}}
function writeJson(p,o){const f=path.join(ROOT,p); fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f,JSON.stringify(o,null,2)+'\n')}
function slug(s){return String(s||'general').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72)||'general'}
function textOf(s){return `${s.normalized_query||''} ${s.query||''} ${s.title||''} ${s.raw_title||''} ${s.short_excerpt||''} ${s.excerpt||''}`.trim()}
function intentType(text){const v=String(text||'').toLowerCase(); if(/betterup|hone|culture amp|alternative|vs|compare|comparison/.test(v)) return 'comparison'; if(/download|cost|price|buy|gumroad|worth it/.test(v)) return 'conversion'; if(/burnout|overwhelmed|reset|motivation low|stuck/.test(v)) return 'recovery'; if(/discipline|habit|consistent|accountability|daily routine/.test(v)) return 'discipline'; if(/ai coach|ai executive coach|chatgpt|automation/.test(v)) return 'ai_coaching'; return 'execution';}
function destinationFor(signal,intent,cluster){const rec=signal.publish_recommendation||signal.scoring?.publish_recommendation||signal.status||''; const score=Number(signal.total_score||signal.scoring?.total_score||signal.score||0); if(rec==='discard') return 'memory'; if(intent==='comparison') return 'comparison'; if(score>=40 || /state-of|landscape|research|report/.test(cluster)) return 'authority'; if(rec==='publish' || score>=12) return 'insight'; return 'synthesis';}
function canonicalTarget(dest,cluster){ if(dest==='comparison') return `${AUTHORITY_DOMAIN}/compare/${cluster}.html`; if(dest==='authority') return `${AUTHORITY_DOMAIN}/whitepapers/${cluster}.html`; if(dest==='synthesis') return `${AUTHORITY_DOMAIN}/synthesis-${cluster}.html`; if(dest==='insight') return `${AUTHORITY_DOMAIN}/insights/${cluster}.html`; return AUTHORITY_DOMAIN;}
function loadSignals(){let rows=[]; const scored=readJson('data/community/scored_signals.json',[]); if(Array.isArray(scored)) rows=rows.concat(scored); const socialDir=path.join(ROOT,'data/social/runs'); if(fs.existsSync(socialDir)){for(const f of fs.readdirSync(socialDir).filter(x=>x.endsWith('.json')).sort().slice(-14)){const run=JSON.parse(fs.readFileSync(path.join(socialDir,f),'utf8')); rows=rows.concat((run.records||[]).map(x=>({...x,source_run:f})));}} const reddit=readJson('data/reddit/queries.json',{queries:[]}); rows=rows.concat((reddit.queries||[]).map((q,i)=>({signal_id:`reddit_query_${i}`,source:'reddit',platform:'reddit',query:q.query||q.title||'',cluster:q.cluster_hint||q.cluster||'',intent:q.intent||''}))); return rows;}
function main(){const rows=loadSignals(); const routed=[]; const clusters=new Map();
 // Identity of a routed signal, so the same row read again on the next run is
 // recognised as the same observation instead of counted a second time.
 const routeKeys=new Map(); const clusterMaxScore=new Map();
 for(const s of rows){const text=textOf(s); if(!text) continue; const audience=classifyAudience(text); const frame=audienceFrame(audience,text); const intent=intentType(text); const cluster=slug(s.cluster||s.scoring?.cluster||intent+'-'+audience); const destination_type=destinationFor(s,intent,cluster); const signal_id=s.signal_id||s.normalized_id||slug(text).slice(0,32); const source=s.source||s.platform||s.source_key||'unknown';
  // created_at used to be stamped with the wall clock on every row, so the
  // routing log changed on every run even when no signal had. Anchor it to when
  // the signal was captured; a row with no capture time carries none.
  const route={signal_id,source,query:text.slice(0,240),audience,intent,destination_type,cluster_id:cluster,canonical_target:canonicalTarget(destination_type,cluster),cta_target:CTA_TARGET,audience_frame:frame,created_at:s.captured_at||s.created_at||null}; routed.push(route);
  if(!routeKeys.has(cluster)) routeKeys.set(cluster,[]); routeKeys.get(cluster).push(`${source}|${signal_id}`);
  clusterMaxScore.set(cluster,Math.max(clusterMaxScore.get(cluster)||0,Number(s.total_score||s.scoring?.total_score||s.score||0)));
  const c=clusters.get(cluster)||{cluster_id:cluster,audiences:{},intents:{},routes:{},canonical_target:route.canonical_target,cta_target:CTA_TARGET,status:'emerging'}; c.audiences[audience]=(c.audiences[audience]||0)+1; c.intents[intent]=(c.intents[intent]||0)+1; c.routes[destination_type]=(c.routes[destination_type]||0)+1; clusters.set(cluster,c);}
 // This used to be `signal_count: Number(old.signal_count||0) + c.signal_count`,
 // which re-added the whole freshly-recomputed per-run total onto the persisted
 // one every run. Nothing recorded WHICH signals were already counted, so the
 // same unchanged rows inflated the number forever - and because this script
 // runs after clusters:update in `npm run content:pipeline`, it also overwrote
 // whatever that script had concluded. Counts drove whitepaper promotion, so
 // clusters were published on a timer rather than on evidence.
 //
 // Both writers now add into one shared ledger of distinct signal keys, under
 // their own namespace, and the count is the union's size. See
 // scripts/lib/cluster_signal_ledger.js.
 const existing=readJson(MEMORY,{clusters:[],policy:{}}); const prior=new Map((existing.clusters||[]).map(c=>[c.cluster_id,c]));
 let newlyDistinct=0;
 for(const c of clusters.values()){
   const old=prior.get(c.cluster_id)||{};
   // signal_count/saturation/authority_ready are derived by the ledger, so the
   // per-run tallies computed above must not be spread over the persisted ones.
   const {signal_count:_ignoredCount, saturation:_ignoredSaturation, authority_ready:_ignoredReady, ...perRun}=c;
   const merged={...old,...perRun,conversion_url:CTA_TARGET,canonical_domain:AUTHORITY_DOMAIN};
   newlyDistinct+=applySignalKeys(merged,'route',routeKeys.get(c.cluster_id)||[],{maxScore:clusterMaxScore.get(c.cluster_id)||0});
   prior.set(c.cluster_id,merged);
 }
 // Stamping generated_at unconditionally rewrote this file on every run even
 // when not one route had changed, which puts a diff in every release commit and
 // makes "the generators disagree with the tree" impossible to read. Move the
 // timestamp only when the routes actually move.
 const priorLog=readJson(OUT,{routes:[]});
 const routesChanged=JSON.stringify(priorLog.routes||[])!==JSON.stringify(routed);
 writeJson(OUT,{generated_at:routesChanged?new Date().toISOString():(priorLog.generated_at||new Date().toISOString()),policy:{all_signals_get_destination:true,cta_target:CTA_TARGET,authority_domain:AUTHORITY_DOMAIN},routes:routed}); writeJson(MEMORY,{generated_at:existing.generated_at||new Date().toISOString(),count_basis:'distinct_signal_keys',policy:{trigger_based_authority:true,no_firehose:true},clusters:[...prior.values()].sort((a,b)=>(b.authority_potential||0)-(a.authority_potential||0)||String(a.cluster_id).localeCompare(String(b.cluster_id)))}); console.log(`route:signals routed ${routed.length} signals into ${clusters.size} clusters; ${newlyDistinct} newly distinct`);}
if(require.main===module) main();
