#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const outDir = path.join(ROOT, 'data/backlog');
fs.mkdirSync(outDir, { recursive: true });
function readJson(file, fallback) { try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; } catch { return fallback; } }
const approved = readJson(path.join(ROOT, 'data/clusters/approved_clusters.json'), { clusters: [] }).clusters || [];
const scorecard = readJson(path.join(ROOT, 'reports/answer_surface_scorecard.json'), { ranked: [] }).ranked || [];
const existing = readJson(path.join(outDir, 'expansion_backlog.json'), { items: [] }).items || [];
const seen = new Set(existing.map(i => i.cluster));
const items = [...existing];
for (const c of approved) {
  if (seen.has(c.cluster_id)) continue;
  const score = scorecard.find(s => s.cluster === c.cluster_id || s.cluster === c.label);
  items.push({
    id: `cluster_${c.cluster_id}`,
    priority: score && score.status === 'strong' ? 'P3-maintain' : 'P2-expand',
    cluster: c.cluster_id,
    score: score ? score.score : null,
    reason: 'Approved demand cluster available for expansion or reinforcement.',
    target_page: null,
    queries: c.queries || [],
    status: 'pending'
  });
}
fs.writeFileSync(path.join(outDir, 'expansion_backlog.json'), JSON.stringify({ generated_at: new Date().toISOString(), count: items.length, items }, null, 2) + '\n');
console.log(`backlog:build wrote ${items.length} items`);
