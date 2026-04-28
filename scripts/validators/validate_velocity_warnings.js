#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const warnings = [];
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }
function readJson(p, fallback) { try { return exists(p) ? JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')) : fallback; } catch { warnings.push(`${p}: invalid JSON`); return fallback; } }
['data/ingestion/normalized/unified_stream.json','data/clusters/clusters.json','data/clusters/approved_clusters.json','data/backlog/expansion_backlog.json','reports/answer_surface_scorecard.json','reports/answer-surface-dashboard.html'].forEach(p => { if (!exists(p)) warnings.push(`${p}: not generated yet`); });
const scorecard = readJson('reports/answer_surface_scorecard.json', { ranked: [] });
for (const row of (scorecard.ranked || [])) if (row.status !== 'strong') warnings.push(`answer surface weak/unknown: ${row.cluster} (${row.status}, score ${row.score})`);
const backlog = readJson('data/backlog/expansion_backlog.json', { items: [] });
if ((backlog.items || []).length > 50) warnings.push(`large expansion backlog: ${backlog.items.length} items`);
console.log(`[validate_velocity_warnings] ${warnings.length ? 'WARN' : 'OK'}`);
warnings.slice(0, 120).forEach(w => console.log(` - ${w}`));
process.exit(0);
