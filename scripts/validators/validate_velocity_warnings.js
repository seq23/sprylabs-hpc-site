#!/usr/bin/env node
'use strict';
const fs=require('fs'); const path=require('path'); const ROOT=process.cwd();
const warnings=[]; const info=[];
function exists(p){return fs.existsSync(path.join(ROOT,p));}
function readJson(p,fallback){try{return exists(p)?JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8')):fallback;}catch{warnings.push(`${p}: invalid JSON`);return fallback;}}
['data/ingestion/normalized/unified_stream.json','data/clusters/clusters.json','data/clusters/approved_clusters.json','data/backlog/expansion_backlog.json','reports/answer_surface_scorecard.json','reports/answer-surface-dashboard.html'].forEach(p=>{if(!exists(p))warnings.push(`${p}: not generated yet`);});
const scorecard=readJson('reports/answer_surface_scorecard.json',{ranked:[]});
for(const row of scorecard.ranked||[]){
  const unobserved=row.status==='unknown'||row.status==='not_observed'||row.unknown_mentions===row.total_queries;
  if(unobserved) info.push(`NOT_OBSERVED: ${row.cluster} (${row.total_queries} queries)`);
  else if(row.status==='regressed') warnings.push(`citation regression: ${row.cluster}`);
  else if(row.status!=='strong'&&row.status!=='cited') warnings.push(`observed answer surface needs work: ${row.cluster} (${row.status}, score ${row.score})`);
}
const backlog=readJson('data/backlog/expansion_backlog.json',{items:[]});
if((backlog.items||[]).length>50) warnings.push(`large expansion backlog: ${backlog.items.length} items`);
console.log(`[validate_velocity_warnings] ${warnings.length?'WARN':'OK'}: actionable=${warnings.length}; info=${info.length}`);
warnings.forEach(w=>console.log(` - WARN ${w}`)); info.forEach(w=>console.log(` - INFO ${w}`)); process.exit(0);
