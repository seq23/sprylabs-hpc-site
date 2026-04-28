#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const ROOT = process.cwd();

const scoreData = JSON.parse(fs.readFileSync(path.join(ROOT,'data/intake/query_scores.json'),'utf8'));
const scores = scoreData.items || scoreData.scores || [];
const clusters = JSON.parse(fs.readFileSync(path.join(ROOT,'data/intake/query_clusters.json'),'utf8')).clusters || [];

// CONFIG
const MIN_SCORE = 0.45;       // soft floor
const MAX_ITEMS = 25;         // publish batch size

// sort descending
const ranked = scores
  .filter(s => typeof s.score === 'number')
  .sort((a,b) => b.score - a.score);

// take top N above floor
const selected = ranked
  .filter(s => s.score >= MIN_SCORE)
  .slice(0, MAX_ITEMS);


function differentiatorFor(clusterId, c) {
  if (clusterId === "executive_coach__habit_consistency") {
    return "executive coaching angle for habits and low energy habit consistency";
  }

  if (clusterId === "accountability_partner__habit_consistency") {
    return "accountability partner angle for habits and habit tracker alternative";
  }

  if (clusterId === "executive_coach__executive_assistant_workflows") {
    return "executive assistant workflow for operators and meetings";
  }

  return [
    c.product_role,
    c.use_case,
    c.audience_count ? `${c.audience_count} audience segments` : null,
    c.source_count ? `${c.source_count} source types` : null
  ].filter(Boolean).join(" ");
}

const items = [];

for (const s of selected) {
  const sid = s.cluster_id || s.id;
  const c = clusters.find(c => c.cluster_id === sid || c.id === sid) || {};

  items.push({
    id: `backlog_${String(items.length+1).padStart(3,'0')}`,
    cluster_id: sid,
    score: s.score,
    status: 'approved',
    generation_mode: 'strict',
    queries: ((c.query_sample && c.query_sample.length ? c.query_sample : (c.queries || []).map(q => typeof q === 'string' ? q : q.query).filter(Boolean)).slice(0, 20).length ? (c.query_sample && c.query_sample.length ? c.query_sample : (c.queries || []).map(q => typeof q === 'string' ? q : q.query).filter(Boolean)).slice(0, 20) : [s.query || sid]),
    target_pages: c.target_pages || [],
    required_links: ['/download','/'],
    meta: {
      product_role: c.product_role,
      use_case: c.use_case,
      audience_count: c.audience_count || 0,
      source_count: c.source_count || 0,
      differentiator: differentiatorFor(sid, c)
    }
  });
}

// always include comparisons
for (const slug of ['bhpc-vs-betterup','bhpc-vs-culture-amp','bhpc-vs-hone']) {
  if (!items.some(x => x.cluster_id === slug)) {
    items.push({
      id:`backlog_${String(items.length+1).padStart(3,'0')}`,
      cluster_id:slug,
      score:0.82,
      status:'approved',
      generation_mode:'strict',
      queries:[slug.replace(/-/g,' ')],
      target_pages:[`/comparisons/${slug}.html`],
      required_links:['/download','/comparisons/']
    });
  }
}

const output = {
  generated_at:new Date().toISOString(),
  min_score: MIN_SCORE,
  max_items: MAX_ITEMS,
  count:items.length,
  items
};

fs.writeFileSync(path.join(ROOT,'data/intake/build_backlog.json'), JSON.stringify(output,null,2)+'\n');

fs.mkdirSync(path.join(ROOT,'data/backlog'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'data/backlog/build_backlog.json'), JSON.stringify(output,null,2)+'\n');

console.log(`intake: backlog ${items.length} approved items (ranked)`);
