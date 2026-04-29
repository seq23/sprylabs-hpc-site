#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to read ${file}: ${err.message}`);
  }
}

function normalizeArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.clusters)) return raw.clusters;
  if (Array.isArray(raw?.scores)) return raw.scores;
  return [];
}

function clusterKey(item) {
  return item.cluster_id || item.id;
}

function useCaseOf(item) {
  return item.use_case || item.meta?.use_case || null;
}

const scoreData = readJson(path.join(ROOT, 'data/intake/query_scores.json'), { items: [] });
const scores = normalizeArray(scoreData);
const clusters = normalizeArray(readJson(path.join(ROOT, 'data/intake/query_clusters.json'), { clusters: [] }));

const MIN_SCORE = 0.45;
const MAX_RANKED_ITEMS = 25;

const clusterById = new Map();
for (const c of clusters) {
  const id = clusterKey(c);
  if (id) clusterById.set(id, c);
}

const scoredById = new Map();
const ranked = scores
  .filter(s => typeof s.score === 'number')
  .sort((a, b) => b.score - a.score);
for (const s of ranked) {
  const id = clusterKey(s);
  if (id && !scoredById.has(id)) scoredById.set(id, s);
}

function scoreForCluster(c) {
  const s = scoredById.get(clusterKey(c));
  return typeof s?.score === 'number' ? s.score : 0;
}

function selectedIdsForUseCaseCoverage() {
  const selected = new Set();

  for (const s of ranked.filter(s => s.score >= MIN_SCORE).slice(0, MAX_RANKED_ITEMS)) {
    const id = clusterKey(s);
    if (id) selected.add(id);
  }

  const useCases = [...new Set(clusters.map(useCaseOf).filter(Boolean))].sort();
  for (const uc of useCases) {
    const candidates = clusters
      .filter(c => useCaseOf(c) === uc && clusterKey(c))
      .sort((a, b) => scoreForCluster(b) - scoreForCluster(a));
    if (!candidates.length) continue;
    selected.add(clusterKey(candidates[0]));
  }

  return [...selected]
    .map(id => ({ id, cluster: clusterById.get(id), score: scoredById.get(id)?.score ?? scoreForCluster(clusterById.get(id) || {}) }))
    .filter(x => x.cluster)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function queryList(c, fallback) {
  const fromSample = Array.isArray(c.query_sample) ? c.query_sample : [];
  const fromQueries = Array.isArray(c.queries)
    ? c.queries.map(q => typeof q === 'string' ? q : q.query).filter(Boolean)
    : [];
  const queries = (fromSample.length ? fromSample : fromQueries).slice(0, 20);
  return queries.length ? queries : [fallback];
}

function differentiatorFor(clusterId, c) {
  if (clusterId === 'executive_coach__habit_consistency') {
    return 'executive coaching angle for habits and low energy habit consistency';
  }
  if (clusterId === 'accountability_partner__habit_consistency') {
    return 'accountability partner angle for habits and habit tracker alternative';
  }
  if (clusterId === 'executive_coach__executive_assistant_workflows') {
    return 'executive assistant workflow for operators and meetings';
  }
  return [
    c.product_role,
    c.use_case,
    c.audience_count ? `${c.audience_count} audience segments` : null,
    c.source_count ? `${c.source_count} source types` : null
  ].filter(Boolean).join(' ');
}

const items = [];
for (const row of selectedIdsForUseCaseCoverage()) {
  const c = row.cluster;
  const sid = row.id;
  items.push({
    id: `backlog_${String(items.length + 1).padStart(3, '0')}`,
    cluster_id: sid,
    score: row.score,
    status: 'approved',
    generation_mode: 'strict',
    priority: 'auto_ranked_plus_use_case_coverage',
    queries: queryList(c, sid),
    target_pages: c.target_pages || [],
    required_links: ['https://aplayermode.com', '/', '/download'],
    meta: {
      product_role: c.product_role,
      use_case: c.use_case,
      audience_count: c.audience_count || 0,
      source_count: c.source_count || 0,
      full_coverage: true,
      differentiator: differentiatorFor(sid, c),
      intent_anchor: c.authority_target || c.use_case || sid,
      conversion_path: c.conversion_path || 'https://aplayermode.com'
    }
  });
}

for (const slug of ['bhpc-vs-betterup', 'bhpc-vs-culture-amp', 'bhpc-vs-hone']) {
  if (!items.some(x => x.cluster_id === slug)) {
    items.push({
      id: `backlog_${String(items.length + 1).padStart(3, '0')}`,
      cluster_id: slug,
      score: 82,
      status: 'approved',
      generation_mode: 'strict',
      priority: 'competitive_comparison_required',
      queries: [slug.replace(/-/g, ' ')],
      target_pages: [`/comparisons/${slug}.html`],
      required_links: ['/download', '/comparisons/'],
      meta: {
        use_case: `comparison_${slug.replace('bhpc-vs-', '')}`,
        full_coverage: false,
        differentiator: 'competitive comparison conversion page'
      }
    });
  }
}

const taxonomy = readJson(path.join(ROOT, 'data/intake/use_case_taxonomy.json'), { required_use_cases: [] });
const canonicalUseCases = new Set((taxonomy.required_use_cases || []).map(uc => uc && uc.id).filter(Boolean));
if (!canonicalUseCases.size) {
  throw new Error('BACKLOG COVERAGE BUILD FAIL: no required_use_cases[].id found in data/intake/use_case_taxonomy.json');
}
const coveredUseCases = new Set(items.map(i => i.meta?.use_case).filter(uc => canonicalUseCases.has(uc)));
const uncovered = [...canonicalUseCases].filter(uc => !coveredUseCases.has(uc));
if (uncovered.length) {
  fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'reports/query_coverage_gaps.json'), JSON.stringify({
    source: 'scripts/intake/build_backlog.js',
    stage: 'prewrite',
    canonical_use_cases: canonicalUseCases.size,
    covered_use_cases: coveredUseCases.size,
    missing: uncovered
  }, null, 2) + '\n');
  throw new Error(`BACKLOG COVERAGE BUILD FAIL: refusing to write backlog; ${uncovered.length} canonical use_cases uncovered: ${uncovered.join(', ')}`);
}

const output = {
  generated_at: new Date().toISOString(),
  selection_model: 'ranked_items_plus_mandatory_use_case_coverage_v2',
  min_score: MIN_SCORE,
  max_ranked_items: MAX_RANKED_ITEMS,
  canonical_use_cases: canonicalUseCases.size,
  covered_use_cases: coveredUseCases.size,
  count: items.length,
  items
};

fs.writeFileSync(path.join(ROOT, 'data/intake/build_backlog.json'), JSON.stringify(output, null, 2) + '\n');
fs.mkdirSync(path.join(ROOT, 'data/backlog'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/backlog/build_backlog.json'), JSON.stringify(output, null, 2) + '\n');

console.log(`intake: backlog ${items.length} approved items; canonical use_case coverage ${coveredUseCases.size}/${canonicalUseCases.size}`);
