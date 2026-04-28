#!/usr/bin/env node
const fs=require('fs'), path=require('path'); const ROOT=process.cwd();
const clusters=JSON.parse(fs.readFileSync(path.join(ROOT,'data/intake/query_clusters.json'),'utf8')).clusters||[];
const scores=clusters.map(c=>{ const q=(c.queries||[]).join(' ').toLowerCase(); const volume=Math.min(1,(c.query_count||1)/5); const intent=/vs|alternative|coach|system|what|how|best/.test(q)?0.85:0.65; const monet=/coach|system|accountability|comparison|life/.test(c.cluster_id)?0.9:0.75; const gap=(c.target_pages||[]).length?0.25:1; const competition=0.65; const score=Number(((volume*.25)+(intent*.25)+(monet*.20)+(competition*.15)+(gap*.15)).toFixed(3)); return {cluster_id:c.cluster_id,volume_score:volume,intent_score:intent,monetization_score:monet,competition_score:competition,coverage_gap_score:gap,score,threshold:0.55,approved:score>=0.55}; });
fs.writeFileSync(path.join(ROOT,'data/intake/query_scores.json'), JSON.stringify({generated_at:new Date().toISOString(), count:scores.length, scores},null,2)+'\n');
console.log(`intake: scored ${scores.length} clusters`);
