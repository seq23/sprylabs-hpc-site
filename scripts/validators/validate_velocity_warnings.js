#!/usr/bin/env node
'use strict';
const fs=require('fs'); const path=require('path'); const ROOT=process.cwd();
const warnings=[]; const info=[];
function exists(p){return fs.existsSync(path.join(ROOT,p));}
function readJson(p,fallback){try{return exists(p)?JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8')):fallback;}catch{warnings.push(`${p}: invalid JSON`);return fallback;}}
['data/ingestion/normalized/unified_stream.json','data/clusters/clusters.json','data/clusters/approved_clusters.json','data/backlog/expansion_backlog.json','reports/answer_surface_scorecard.json','reports/answer-surface-dashboard.html'].forEach(p=>{if(!exists(p))warnings.push(`${p}: not generated yet`);});
// The two inputs this reasons over both fall back to empty when absent or
// corrupt, and every finding is a console.log behind an unconditional
// exit 0 - so a deleted scorecard printed "OK: actionable=0" having examined
// nothing. Warnings stay non-blocking (that is what this validator is for);
// being unable to read the inputs it claims to have warned from does not.
const inputErrors=[];
function requireList(rel,key,what){
  if(!exists(rel)){inputErrors.push(`${rel}: missing; expected ${what}`);return [];}
  let doc; try{doc=JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));}catch(e){inputErrors.push(`${rel}: unreadable JSON (${e.message}); expected ${what}`);return [];}
  const list=doc[key];
  if(!Array.isArray(list)||!list.length){inputErrors.push(`${rel}: "${key}" is empty or absent; expected ${what}. Warning over an empty list is not a clean run.`);return [];}
  return list;
}
const ranked=requireList('reports/answer_surface_scorecard.json','ranked','the ranked answer-surface clusters this check warns about');
const backlogItems=requireList('data/backlog/expansion_backlog.json','items','the expansion backlog items whose size this check warns about');

for(const row of ranked){
  const unobserved=row.status==='unknown'||row.status==='not_observed'||row.unknown_mentions===row.total_queries;
  if(unobserved) info.push(`NOT_OBSERVED: ${row.cluster} (${row.total_queries} queries)`);
  else if(row.status==='regressed') warnings.push(`citation regression: ${row.cluster}`);
  else if(row.status!=='strong'&&row.status!=='cited') warnings.push(`observed answer surface needs work: ${row.cluster} (${row.status}, score ${row.score})`);
}
if(backlogItems.length>50) warnings.push(`large expansion backlog: ${backlogItems.length} items`);
if(inputErrors.length){
  console.error(`[validate_velocity_warnings] FAIL: ${inputErrors.length} input(s) could not be read or were empty; this check examined ${ranked.length} scorecard row(s) and ${backlogItems.length} backlog item(s) and cannot claim to have warned about anything.`);
  for(const e of inputErrors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`[validate_velocity_warnings] ${warnings.length?'WARN':'OK'}: actionable=${warnings.length}; info=${info.length}; examined=${ranked.length} scorecard row(s), ${backlogItems.length} backlog item(s)`);
warnings.forEach(w=>console.log(` - WARN ${w}`)); info.forEach(w=>console.log(` - INFO ${w}`)); process.exit(0);
