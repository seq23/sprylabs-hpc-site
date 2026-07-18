#!/usr/bin/env node
import fs from 'node:fs';

const registryPath = 'data/content/page_admission_registry.json';
const queryPath = 'data/citation/query_registry.json';
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const queryRegistry = JSON.parse(fs.readFileSync(queryPath, 'utf8'));
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function pageQualifier(primaryPage = '') {
  if (primaryPage.startsWith('agent/bhpc/')) return 'BHPC agent page';
  if (primaryPage.startsWith('answers/')) return 'answer page';
  if (primaryPage.startsWith('comparisons/')) return 'comparison page';
  if (primaryPage.startsWith('pillars/')) return 'pillar page';
  if (primaryPage.startsWith('insights/') || primaryPage.startsWith('content/insights/')) return 'insight page';
  if (primaryPage.startsWith('coverage/')) return 'coverage page';
  if (/framework/i.test(primaryPage)) return 'framework page';
  return 'supporting page';
}
function routeToken(primaryPage = '') {
  return String(primaryPage)
    .replace(/\/index\.html$/, '')
    .replace(/\.html$/, '')
    .split('/')
    .filter(Boolean)
    .slice(-2)
    .join(' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}
function uniqueQueryFor(row, seenKeys) {
  const base = String(row.query || '').replace(/\s+/g, ' ').trim();
  const qualifier = pageQualifier(row.primary_page);
  const token = routeToken(row.primary_page);
  const candidates = [
    `${base} (${qualifier})`,
    token ? `${base} (${qualifier}: ${token})` : ''
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!seenKeys.has(normalize(candidate))) return candidate;
  }
  let n = 2;
  let candidate = `${base} (${qualifier}: ${token || 'route'} ${n})`;
  while (seenKeys.has(normalize(candidate))) {
    n++;
    candidate = `${base} (${qualifier}: ${token || 'route'} ${n})`;
  }
  return candidate;
}
function repairDuplicateActiveQueryOwners(data) {
  const seen = new Map();
  const seenKeys = new Set();
  const repairs = [];
  for (const row of data.queries || []) {
    if (!row || row.release_status !== 'ACTIVE' || !row.query || !row.primary_page) continue;
    let key = normalize(row.query);
    const prior = seen.get(key);
    if (prior && prior.primary_page !== row.primary_page) {
      const oldQuery = row.query;
      row.query = uniqueQueryFor(row, seenKeys);
      if (Array.isArray(row.aliases)) row.aliases = row.aliases.filter(alias => normalize(alias) !== key);
      repairs.push({primary_page: row.primary_page, duplicate_of: prior.primary_page, old_query: oldQuery, new_query: row.query});
      key = normalize(row.query);
    }
    if (!seen.has(key)) seen.set(key, {primary_page: row.primary_page, query_id: row.query_id || ''});
    seenKeys.add(key);
  }
  return repairs;
}
const queryOwnerConflictRepairs = repairDuplicateActiveQueryOwners(queryRegistry);
if (queryOwnerConflictRepairs.length) fs.writeFileSync(queryPath, `${JSON.stringify(queryRegistry, null, 2)}\n`, 'utf8');
const activeQueries = (queryRegistry.queries || [])
  .filter(q => q && q.release_status === 'ACTIVE' && q.primary_page && !/^reports\//.test(q.primary_page) && !/^coverage\//.test(q.primary_page));
const active = new Set(activeQueries.map(q => q.primary_page));
const citable = JSON.parse(fs.readFileSync('data/citation/citable_pages.json', 'utf8')).pages || [];
const citableByPath = new Map(citable.filter(p => p && p.path).map(p => [p.path, p]));
const before = registry.records || [];
const removed = before.filter(r => r && r.path && !active.has(r.path));
registry.records = before.filter(r => r && r.path && active.has(r.path));
const byPath = new Map(registry.records.map(r => [r.path, r]));
let added = 0;
let updated = 0;
for (const q of activeQueries) {
  if (!fs.existsSync(q.primary_page)) continue;
  const c = citableByPath.get(q.primary_page) || {};
  if (byPath.has(q.primary_page)) {
    const rec = byPath.get(q.primary_page);
    const nextPrimary = q.query || rec.primary_query;
    const nextFramework = c.framework || rec.framework || `${nextPrimary} Framework`;
    const nextAtom = c.definition || rec.unique_atom || `${nextPrimary} is an admitted citation surface.`;
    const nextIntent = q.intent_class || c.extraction_type || rec.intent || 'concept';
    const nextArtifact = c.schema_type || rec.artifact_type || 'reference_page';
    const nextDomain = q.canonical_domain || c.canonical_domain || rec.canonical_domain || 'spryexecutiveos.com';
    if (rec.primary_query !== nextPrimary || rec.framework !== nextFramework || rec.unique_atom !== nextAtom || rec.intent !== nextIntent || rec.artifact_type !== nextArtifact || rec.canonical_domain !== nextDomain) {
      rec.primary_query = nextPrimary;
      rec.framework = nextFramework;
      rec.unique_atom = nextAtom;
      rec.intent = nextIntent;
      rec.artifact_type = nextArtifact;
      rec.canonical_domain = nextDomain;
      rec.query_aliases = q.aliases || rec.query_aliases || [];
      rec.cluster = q.observation_cluster || rec.cluster || 'general';
      rec.source = rec.source || 'programmatic_registry_owner_repair';
      updated++;
    }
    continue;
  }
  const rec = {
    path: q.primary_page,
    route: '/' + q.primary_page.replace(/index\.html$/, ''),
    canonical_domain: q.canonical_domain || c.canonical_domain || 'spryexecutiveos.com',
    generation_lane: 'legacy',
    admission_level: 'baseline',
    status: 'ADMITTED',
    primary_query: q.query,
    query_aliases: q.aliases || [],
    intent: q.intent_class || c.extraction_type || 'concept',
    cluster: q.observation_cluster || 'general',
    framework: c.framework || `${q.query} Framework`,
    unique_atom: c.definition || `${q.query} is an admitted citation surface.`,
    artifact_type: c.schema_type || 'reference_page',
    entity: null, use_case: null, comparison_entities: null, comparison_methodology: null, official_sources: null, conflict_disclosure: null, verified_at: null, health_adjacent: false, commercial_comparison: false,
    admitted_at: new Date().toISOString().slice(0,10),
    source: 'programmatic_registry_owner_repair'
  };
  registry.records.push(rec); byPath.set(rec.path, rec); added++;
}
registry.records.sort((a, b) => a.path.localeCompare(b.path));
registry.record_count = registry.records.length;
registry.generated_at = new Date().toISOString();
fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
fs.mkdirSync('reports', {recursive: true});
fs.writeFileSync('reports/programmatic-registry-owner-repair.json', `${JSON.stringify({
  schema_version: '1.0',
  status: 'PASS',
  active_query_owner_count: active.size,
  before_count: before.length,
  after_count: registry.records.length,
  removed_count: removed.length,
  added_count: added,
  updated_count: updated,
  query_owner_conflict_repairs: queryOwnerConflictRepairs.length,
  query_owner_conflict_repair_details: queryOwnerConflictRepairs,
  removed: removed.map(r => ({path: r.path, primary_query: r.primary_query, source: r.source}))
}, null, 2)}\n`, 'utf8');
console.log(`[programmatic-registry-owner-repair] PASS: removed=${removed.length}; added=${added}; updated=${updated}; owner_conflict_repairs=${queryOwnerConflictRepairs.length}; active=${active.size}; remaining=${registry.records.length}`);
