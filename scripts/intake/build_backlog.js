#!/usr/bin/env node
const fs=require('fs'), path=require('path'); const ROOT=process.cwd();
const scores=JSON.parse(fs.readFileSync(path.join(ROOT,'data/intake/query_scores.json'),'utf8')).scores||[];
const clusters=JSON.parse(fs.readFileSync(path.join(ROOT,'data/intake/query_clusters.json'),'utf8')).clusters||[];
const items=[]; for (const s of scores.filter(x=>x.approved)) { const c=clusters.find(c=>c.cluster_id===s.cluster_id)||{}; items.push({id:`backlog_${String(items.length+1).padStart(3,'0')}`, cluster_id:s.cluster_id, score:s.score, status:'approved', generation_mode:'strict', queries:c.queries||[], target_pages:c.target_pages||[], required_links:['/download','/']}); }
for (const slug of ['bhpc-vs-betterup','bhpc-vs-culture-amp','bhpc-vs-hone']) if (!items.some(x=>x.cluster_id===slug)) items.push({id:`backlog_${String(items.length+1).padStart(3,'0')}`, cluster_id:slug, score:0.82, status:'approved', generation_mode:'strict', queries:[slug.replace(/-/g,' ')], target_pages:[`/comparisons/${slug}.html`], required_links:['/download','/comparisons/']});
fs.writeFileSync(path.join(ROOT,'data/intake/build_backlog.json'), JSON.stringify({generated_at:new Date().toISOString(), threshold:0.55, count:items.length, items},null,2)+'\n');
fs.mkdirSync(path.join(ROOT,'data/backlog'),{recursive:true}); fs.writeFileSync(path.join(ROOT,'data/backlog/build_backlog.json'), JSON.stringify({generated_at:new Date().toISOString(), threshold:0.55, count:items.length, items},null,2)+'\n');
console.log(`intake: backlog ${items.length} approved items`);
