#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const inputPath = path.join(ROOT, 'data/ingestion/normalized/unified_stream.json');
const outDir = path.join(ROOT, 'data/clusters');
fs.mkdirSync(outDir, { recursive: true });
function readJson(file, fallback) { try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; } catch { return fallback; } }
function slug(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || 'uncategorized'; }
function inferCluster(item) {
  const text = `${item.cluster_hint || ''} ${item.query || ''}`.toLowerCase();
  const rules = [
    ['comparison', /vs|versus|alternative|betterup|hone|coachhub|torch|culture amp/],
    ['ai-executive-coaching', /executive coach|ai coach|coaching/],
    ['accountability-system', /accountability|check[- ]?in|partner/],
    ['daily-planning', /daily plan|planning|calendar|weekly review|what should i work on/],
    ['decision-fatigue', /decision|priorit|mental load|cognitive overload/],
    ['overplanning', /overplan|researching instead|planning without/],
    ['consistency-recovery', /consistent|consistency|missed|restart|motivation|discipline/],
    ['minimum-viable-day', /minimum viable day|low energy|bad day|momentum/],
    ['personal-operating-system', /operating system|personal os|executive os|structure/],
    ['founder-workflows', /founder|operator|entrepreneur|workflow/]
  ];
  for (const [id, rx] of rules) if (rx.test(text)) return id;
  return slug(item.cluster_hint || item.intent || 'general-ai-execution');
}
const input = readJson(inputPath, { items: [] });
const groups = new Map();
for (const item of (input.items || [])) {
  const id = inferCluster(item);
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push(item);
}
const clusters = [...groups.entries()].map(([cluster_id, items]) => {
  const sources = [...new Set(items.map(i => i.source).filter(Boolean))];
  const queries = [...new Set(items.map(i => i.query).filter(Boolean))];
  const commercial = Math.round(items.reduce((a, i) => a + Number(i.commercial_signal || 0), 0) / Math.max(items.length, 1));
  return {
    cluster_id,
    label: cluster_id.replace(/-/g, ' '),
    size: items.length,
    query_count: queries.length,
    source_count: sources.length,
    sources,
    queries: queries.slice(0, 25),
    commercial_signal: commercial,
    items
  };
}).sort((a,b) => b.size - a.size || a.cluster_id.localeCompare(b.cluster_id));
fs.writeFileSync(path.join(outDir, 'clusters.json'), JSON.stringify({ generated_at: new Date().toISOString(), clusters }, null, 2) + '\n');
console.log(`cluster_unified_stream: wrote ${clusters.length} clusters`);
