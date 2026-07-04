#!/usr/bin/env node
import fs from 'node:fs';

const registryPath = 'data/content/page_admission_registry.json';
const queryPath = 'data/citation/query_registry.json';
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const queryRegistry = JSON.parse(fs.readFileSync(queryPath, 'utf8'));
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
  removed: removed.map(r => ({path: r.path, primary_query: r.primary_query, source: r.source}))
}, null, 2)}\n`, 'utf8');
console.log(`[programmatic-registry-owner-repair] PASS: removed=${removed.length}; added=${added}; updated=${updated}; active=${active.size}; remaining=${registry.records.length}`);
