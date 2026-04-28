#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const reports = path.join(ROOT, 'reports');
const outDir = path.join(ROOT, 'data/backlog');
fs.mkdirSync(outDir, { recursive: true });
function readJson(file, fallback) { try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; } catch { return fallback; } }
const scorecard = readJson(path.join(reports, 'answer_surface_scorecard.json'), { ranked: [] });
const backlog = (scorecard.ranked || []).filter(r => r.status !== 'strong').map((r, i) => ({
  id: `answer_surface_${String(i + 1).padStart(3, '0')}`,
  priority: r.status === 'unknown' ? 'P1-observe' : 'P1-reinforce',
  cluster: r.cluster,
  score: r.score,
  reason: r.status === 'unknown' ? 'No observed answer-surface result has been logged yet.' : 'Cluster is underperforming relative to competitor/canonical mentions.',
  recommended_actions: [
    'Add or strengthen short-answer block on mapped page',
    'Add comparison/objection handling section where commercially relevant',
    'Add internal links from adjacent high-authority pages',
    'Add query variants to fanout block and llms-readable surfaces'
  ]
}));
const output = { generated_at: new Date().toISOString(), count: backlog.length, items: backlog };
fs.writeFileSync(path.join(outDir, 'expansion_backlog.json'), JSON.stringify(output, null, 2) + '\n');
fs.writeFileSync(path.join(reports, 'answer_surface_expansion_backlog.json'), JSON.stringify(output, null, 2) + '\n');
console.log(`answer:backlog wrote ${backlog.length} items`);
