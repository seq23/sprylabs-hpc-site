#!/usr/bin/env node
const fs = require('fs');

function read(p) {
  if (!fs.existsSync(p)) throw new Error(`missing required file: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function asArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.clusters)) return raw.clusters;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

function useCaseOfCluster(c) {
  return c.use_case || c.meta?.use_case || null;
}

function useCaseOfBacklogItem(i) {
  return i.meta?.use_case || i.use_case || null;
}

const clusters = asArray(read('data/intake/query_clusters.json'));
const backlog = asArray(read('data/intake/build_backlog.json'));

const canonicalUseCases = new Set(clusters.map(useCaseOfCluster).filter(Boolean));
const backlogUseCases = new Set(backlog.map(useCaseOfBacklogItem).filter(Boolean));
const coveredCanonicalUseCases = [...canonicalUseCases].filter(uc => backlogUseCases.has(uc)).sort();
const uncovered = [...canonicalUseCases].filter(uc => !backlogUseCases.has(uc)).sort();

const uncoveredDetails = uncovered.map(use_case => ({
  use_case,
  available_clusters: clusters
    .filter(c => useCaseOfCluster(c) === use_case)
    .map(c => ({ cluster_id: c.cluster_id || c.id, product_role: c.product_role, query_count: c.query_count || 0 }))
}));

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/query_coverage_gaps.json', JSON.stringify({
  generated_at: new Date().toISOString(),
  coverage_model: 'canonical_use_case_backlog_coverage_v2',
  canonical_use_cases: canonicalUseCases.size,
  covered_canonical_use_cases: coveredCanonicalUseCases.length,
  backlog_use_cases_total: backlogUseCases.size,
  uncovered_count: uncovered.length,
  uncovered_use_cases: uncovered,
  uncovered_details: uncoveredDetails
}, null, 2));

if (process.env.QUERY_COVERAGE_STRICT === '1' && uncovered.length) {
  throw new Error(`QUERY COVERAGE FAIL: ${uncovered.length} canonical use_cases uncovered. See reports/query_coverage_gaps.json`);
}

console.log(`QUERY COVERAGE PASS: ${coveredCanonicalUseCases.length}/${canonicalUseCases.size} canonical use_cases covered`);
