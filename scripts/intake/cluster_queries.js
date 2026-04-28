#!/usr/bin/env node
const fs = require('fs'); const path = require('path'); const ROOT=process.cwd();
const corpus=JSON.parse(fs.readFileSync(path.join(ROOT,'data/intake/query_corpus.json'),'utf8')).queries||[];
const groups={}; for (const q of corpus) (groups[q.cluster] ||= []).push(q);
const clusters=Object.entries(groups).map(([cluster_id, qs])=>({cluster_id,label:cluster_id.replace(/-/g,' '),query_count:qs.length,queries:qs.map(q=>q.query),target_pages:[...new Set(qs.map(q=>q.target_page).filter(Boolean))]}));
fs.writeFileSync(path.join(ROOT,'data/intake/query_clusters.json'), JSON.stringify({generated_at:new Date().toISOString(), count:clusters.length, clusters},null,2)+'\n');
console.log(`intake: clustered ${clusters.length} clusters`);
