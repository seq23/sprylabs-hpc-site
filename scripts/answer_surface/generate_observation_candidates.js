#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const outDir = path.join(ROOT, 'data/answer_surface_monitoring');
fs.mkdirSync(outDir, { recursive: true });
function readJson(file, fallback) { try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; } catch { return fallback; } }
const seedPath = path.join(outDir, 'queries.seed.json');
let seeds = readJson(seedPath, null);
if (!seeds) {
  const coverage = readJson(path.join(ROOT, 'data/query_coverage_map.json'), {});
  const meta = readJson(path.join(ROOT, 'data/query_metadata.json'), { items: [] });
  const clusters = readJson(path.join(ROOT, 'content/insights/_clusters.json'), []);
  const items = [];
  for (const item of (meta.items || [])) items.push({ vertical: 'bhpc', cluster: item.cluster || item.intent || 'query-metadata', query: item.query || item.title || item.slug });
  for (const c of clusters) items.push({ vertical: 'bhpc', cluster: c.id || c.slug, query: c.name || c.description || c.id });
  // covered_queries rows are cluster records, not query strings. Pushing the row
  // itself produced 36 candidates whose query serialized to "[object Object]",
  // which can never be observed or joined against a probe result.
  for (const q of (coverage.covered_queries || [])) {
    const clusterId = typeof q === 'string' ? q : String(q.cluster_id || q.cluster || '').trim();
    if (!clusterId) continue;
    items.push({ vertical: 'bhpc', cluster: clusterId, query: clusterId.replace(/[-_]+/g, ' ') });
  }
  seeds = { generated_at: new Date().toISOString(), queries: items.filter(i => typeof i.query === 'string' && i.query.trim()) };
  fs.writeFileSync(seedPath, JSON.stringify(seeds, null, 2) + '\n');
}
const candidates = (seeds.queries || seeds.items || []).map((item, index) => ({
  id: item.id || `obs_${String(index + 1).padStart(4, '0')}`,
  vertical: item.vertical || 'bhpc',
  cluster: item.cluster || item.cluster_id || 'general',
  query: item.query || item.question || item.title,
  expected_domains: ['billionairehighperformancecoach.com', 'spryexecutiveos.com', 'aplayermode.com'],
  status: 'pending_manual_or_api_observation'
})).filter(i => typeof i.query === 'string' && i.query.trim());
fs.writeFileSync(path.join(outDir, 'observation_candidates.json'), JSON.stringify({ generated_at: new Date().toISOString(), count: candidates.length, observations: candidates }, null, 2) + '\n');
console.log(`answer:observe candidates: ${candidates.length}`);
