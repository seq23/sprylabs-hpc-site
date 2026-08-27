#!/usr/bin/env node
import fs from 'node:fs';
import { createRequire } from 'node:module';
const requireCjs = createRequire(import.meta.url);
const { routeFor: sharedRouteFor } = requireCjs('../lib/dual_domain_policy.cjs');

const registryPath = 'data/content/page_admission_registry.json';
const queryPath = 'data/citation/query_registry.json';
const citablePath = 'data/citation/citable_pages.json';
const publicRouteManifestPath = 'data/routes/public_route_manifest.json';
const criticalRouteManifestPath = 'data/routes/critical_browser_route_manifest.json';
const answersPath = 'answers.json';
const llmsPath = 'llms.txt';
const llmsFullPath = 'llms-full.txt';
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const registryGeneratedAtBeforeRepair = registry.generated_at || null;
const registrySemanticBeforeRepair = JSON.stringify({...registry, generated_at: undefined});
const queryRegistry = JSON.parse(fs.readFileSync(queryPath, 'utf8'));
const citableRegistry = JSON.parse(fs.readFileSync(citablePath, 'utf8'));
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
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
// Route form is the shared dual-domain contract: the URL that answers 200
// without a redirect hop. See scripts/lib/dual_domain_policy.cjs.
function canonicalUrlFor(row) {
  return `https://${row.canonical_domain || 'spryexecutiveos.com'}${routeForPath(row.primary_page)}`;
}
function routeForPath(primaryPage = '') {
  return sharedRouteFor(String(primaryPage || ''));
}
function targetFor(row) {
  return `/${String(row.primary_page || '').replace(/\\/g, '/')}`;
}
function updateTitleText(raw, oldQuery, newQuery) {
  const oldTitle = new RegExp(escapeRegExp(oldQuery), 'i');
  return raw.replace(/<title>([\s\S]*?)<\/title>/i, (_match, title) => {
    const cleanTitle = String(title || '').trim();
    const nextTitle = oldTitle.test(cleanTitle)
      ? cleanTitle.replace(oldTitle, newQuery)
      : `${newQuery} | Spry Executive OS`;
    return `<title>${escapeHtml(nextTitle)}</title>`;
  });
}
function updateMetaTitle(raw, propertyName, oldQuery, newQuery) {
  const tagPattern = new RegExp(`<meta([^>]+(?:property|name)=["']${escapeRegExp(propertyName)}["'][^>]*)>`, 'i');
  return raw.replace(tagPattern, match => {
    const contentPattern = /content=(["'])(.*?)\1/i;
    if (!contentPattern.test(match)) return match;
    return match.replace(contentPattern, (_content, quote, value) => {
      const nextValue = String(value || '').replace(new RegExp(escapeRegExp(oldQuery), 'i'), newQuery);
      return `content=${quote}${escapeAttr(nextValue)}${quote}`;
    });
  });
}
function updateCitationSchema(raw, oldQuery, newQuery) {
  const schemaPattern = /<script\b([^>]*\bid=["']CITATION_PAGE_SCHEMA["'][^>]*)>([\s\S]*?)<\/script>/i;
  const match = raw.match(schemaPattern);
  if (!match) return {raw, changed: false};
  let data;
  try {
    data = JSON.parse(match[2]);
  } catch {
    return {raw, changed: false};
  }
  const graph = Array.isArray(data['@graph']) ? data['@graph'] : [];
  let changed = false;
  for (const node of graph) {
    if (!node || typeof node !== 'object') continue;
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    const shouldTrackH1 = types.some(type => ['Article', 'BlogPosting', 'WebPage', 'HowTo'].includes(type));
    if (!shouldTrackH1) continue;
    for (const key of ['headline', 'name']) {
      if (typeof node[key] === 'string' && node[key] !== newQuery) {
        node[key] = newQuery;
        changed = true;
      }
    }
  }
  if (!changed) return {raw, changed: false};
  const json = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
  return {raw: raw.replace(schemaPattern, `<script${match[1]}>${json}</script>`), changed: true};
}
function syncCanonicalCitationSurfacesForQueryRepairs(repairs) {
  if (!repairs.length) return {citable_updates: 0, html_updates: 0, schema_updates: 0};
  const byPath = new Map((citableRegistry.pages || []).filter(row => row && row.path).map(row => [row.path, row]));
  let citableUpdates = 0;
  let htmlUpdates = 0;
  let schemaUpdates = 0;
  for (const repair of repairs) {
    const page = byPath.get(repair.primary_page);
    if (page) {
      if (page.query !== repair.new_query) {
        page.query = repair.new_query;
        citableUpdates++;
      }
      if (page.canonical_owner_metadata && page.canonical_owner_metadata.query !== repair.new_query) {
        page.canonical_owner_metadata.query = repair.new_query;
        citableUpdates++;
      }
    }
    if (!fs.existsSync(repair.primary_page)) continue;
    const before = fs.readFileSync(repair.primary_page, 'utf8');
    let next = before.replace(/<h1(\s[^>]*)?>[\s\S]*?<\/h1>/i, (_match, attrs = '') => `<h1${attrs}>${escapeHtml(repair.new_query)}</h1>`);
    next = updateTitleText(next, repair.old_query, repair.new_query);
    next = updateMetaTitle(next, 'og:title', repair.old_query, repair.new_query);
    next = updateMetaTitle(next, 'twitter:title', repair.old_query, repair.new_query);
    const schemaResult = updateCitationSchema(next, repair.old_query, repair.new_query);
    next = schemaResult.raw;
    if (next !== before) {
      fs.writeFileSync(repair.primary_page, next, 'utf8');
      htmlUpdates++;
      if (schemaResult.changed) schemaUpdates++;
    }
  }
  if (citableUpdates) fs.writeFileSync(citablePath, `${JSON.stringify(citableRegistry, null, 2)}\n`, 'utf8');
  return {citable_updates: citableUpdates, html_updates: htmlUpdates, schema_updates: schemaUpdates};
}
function syncRouteManifestsForQueryRepairs(repairs) {
  if (!repairs.length) return {public_updates: 0, critical_updates: 0};
  const changedPaths = new Set(repairs.map(repair => repair.primary_page));
  const byPath = new Map((citableRegistry.pages || []).filter(row => row && row.path).map(row => [row.path, row]));
  let publicUpdates = 0;
  let criticalUpdates = 0;
  if (fs.existsSync(publicRouteManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(publicRouteManifestPath, 'utf8'));
    for (const route of manifest.routes || []) {
      if (!route || !changedPaths.has(route.source_file)) continue;
      const page = byPath.get(route.source_file);
      if (!page) continue;
      const nextRoute = routeForPath(page.path);
      const nextCanonical = page.canonical_url || `https://${page.canonical_domain || 'spryexecutiveos.com'}${nextRoute}`;
      const before = JSON.stringify(route);
      route.path = nextRoute;
      route.canonical_url = nextCanonical;
      route.canonical_domain = page.canonical_domain || new URL(nextCanonical).hostname;
      route.h1 = page.query || route.h1 || '';
      route.framework = page.framework || route.framework || '';
      route.priority = Boolean(page.priority);
      if (JSON.stringify(route) !== before) publicUpdates++;
    }
    if (publicUpdates) fs.writeFileSync(publicRouteManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  if (fs.existsSync(criticalRouteManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(criticalRouteManifestPath, 'utf8'));
    for (const route of manifest.routes || []) {
      if (!route || !changedPaths.has(route.source_file)) continue;
      const page = byPath.get(route.source_file);
      if (!page) continue;
      const nextRoute = routeForPath(page.path);
      const nextCanonical = page.canonical_url || `https://${page.canonical_domain || 'spryexecutiveos.com'}${nextRoute}`;
      const before = JSON.stringify(route);
      route.path = nextRoute;
      route.canonical_url = nextCanonical;
      route.canonical_domain = page.canonical_domain || new URL(nextCanonical).hostname;
      route.h1 = page.query || route.h1 || '';
      route.framework = page.framework || route.framework || '';
      route.definition = page.definition || route.definition || '';
      route.extraction_type = page.extraction_type || route.extraction_type || '';
      route.priority = true;
      if (JSON.stringify(route) !== before) criticalUpdates++;
    }
    if (criticalUpdates) fs.writeFileSync(criticalRouteManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  return {public_updates: publicUpdates, critical_updates: criticalUpdates};
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
      repairs.push({primary_page: row.primary_page, canonical_domain: row.canonical_domain, duplicate_of: prior.primary_page, old_query: oldQuery, new_query: row.query});
      key = normalize(row.query);
    }
    if (!seen.has(key)) seen.set(key, {primary_page: row.primary_page, query_id: row.query_id || ''});
    seenKeys.add(key);
  }
  return repairs;
}
function syncDistributionSurfacesForQueryRepairs(repairs, data) {
  if (!repairs.length) return {answers_updates: 0, llms_updates: 0};
  const rowsByPage = new Map((data.queries || []).filter(row => row && row.primary_page).map(row => [row.primary_page, row]));
  let answersUpdates = 0;
  let llmsUpdates = 0;
  const answers = fs.existsSync(answersPath) ? JSON.parse(fs.readFileSync(answersPath, 'utf8')) : {items: []};
  answers.items = answers.items || [];
  let llms = fs.existsSync(llmsPath) ? fs.readFileSync(llmsPath, 'utf8') : '# Billionaire High Performance Coach / Spry Executive OS\n\n## Citation-ready questions and pages\n';
  for (const repair of repairs) {
    const row = rowsByPage.get(repair.primary_page) || repair;
    const url = canonicalUrlFor(row);
    const target = targetFor(row);
    let item = answers.items.find(entry =>
      entry &&
      ((entry.primary_citation_targets || []).includes(target) || entry.url === url)
    );
    if (!item) {
      item = {
        url,
        title: repair.new_query,
        description: `${repair.new_query} is a registered Spry Executive OS query surface.`,
        queries_supported: [],
        primary_citation_targets: [target],
        named_framework: `${repair.new_query} Framework`,
        citation_strategy: 'registered_primary_page'
      };
      answers.items.push(item);
      answersUpdates++;
    }
    item.queries_supported = Array.isArray(item.queries_supported) ? item.queries_supported : [];
    if (!item.queries_supported.includes(repair.new_query)) {
      item.queries_supported.push(repair.new_query);
      answersUpdates++;
    }
    if (!llms.includes(repair.new_query)) {
      const framework = item.named_framework || `${repair.new_query} Framework`;
      llms += `- Query: ${repair.new_query} | Page: ${url} | Framework: ${framework}\n`;
      llmsUpdates++;
    }
  }
  if (answersUpdates) fs.writeFileSync(answersPath, `${JSON.stringify(answers, null, 2)}\n`, 'utf8');
  if (llmsUpdates) fs.writeFileSync(llmsPath, llms.endsWith('\n') ? llms : `${llms}\n`, 'utf8');
  return {answers_updates: answersUpdates, llms_updates: llmsUpdates};
}
function llmsFullEntry(row, page) {
  return [
    `## ${row.query}`,
    `- URL: ${page.canonical_url || canonicalUrlFor(row)}`,
    `- Framework: ${page.framework || `${row.query} Framework`}`,
    `- Intent: ${page.extraction_type || row.intent_class || 'concept'}`,
    `- Definition: ${page.definition || `${row.query} is a registered citation surface.`}`,
    `- Supporting pages: ${(row.supporting_pages || []).length ? row.supporting_pages.join(', ') : 'None'}`,
    ''
  ].join('\n');
}
function syncLlmsCoverage(activeRows, pagesByPath) {
  let llmsUpdates = 0;
  let llmsFullUpdates = 0;
  let llms = fs.existsSync(llmsPath)
    ? fs.readFileSync(llmsPath, 'utf8')
    : '# Billionaire High Performance Coach / Spry Executive OS\n\n## Citation-ready questions and pages\n';
  let llmsFull = fs.existsSync(llmsFullPath)
    ? fs.readFileSync(llmsFullPath, 'utf8')
    : '# BHPC / Spry Full Citation Index\n\nEach entry names the canonical query owner, framework, intent, definition, and URL.\n\n';
  for (const row of activeRows) {
    const page = pagesByPath.get(row.primary_page);
    if (!page) continue;
    const url = page.canonical_url || canonicalUrlFor(row);
    if (!llms.includes(url) || !llms.includes(row.query)) {
      llms += `${llms.endsWith('\n') ? '' : '\n'}- Query: ${row.query} | Page: ${url} | Framework: ${page.framework || `${row.query} Framework`}\n`;
      llmsUpdates++;
    }
    if (!llmsFull.includes(url) || !llmsFull.includes(row.query)) {
      llmsFull += `${llmsFull.endsWith('\n') ? '' : '\n'}${llmsFullEntry(row, page)}`;
      llmsFullUpdates++;
    }
  }
  if (llmsUpdates) fs.writeFileSync(llmsPath, llms.endsWith('\n') ? llms : `${llms}\n`, 'utf8');
  if (llmsFullUpdates) fs.writeFileSync(llmsFullPath, llmsFull.endsWith('\n') ? llmsFull : `${llmsFull}\n`, 'utf8');
  return {llms_updates: llmsUpdates, llms_full_updates: llmsFullUpdates};
}
const queryOwnerConflictRepairs = repairDuplicateActiveQueryOwners(queryRegistry);
if (queryOwnerConflictRepairs.length) fs.writeFileSync(queryPath, `${JSON.stringify(queryRegistry, null, 2)}\n`, 'utf8');
const canonicalSurfaceSync = syncCanonicalCitationSurfacesForQueryRepairs(queryOwnerConflictRepairs);
const routeManifestSync = syncRouteManifestsForQueryRepairs(queryOwnerConflictRepairs);
const querySurfaceSync = syncDistributionSurfacesForQueryRepairs(queryOwnerConflictRepairs, queryRegistry);
const activeQueries = (queryRegistry.queries || [])
  .filter(q => q && q.release_status === 'ACTIVE' && q.primary_page && !/^reports\//.test(q.primary_page) && !/^coverage\//.test(q.primary_page));
const active = new Set(activeQueries.map(q => q.primary_page));
const citable = JSON.parse(fs.readFileSync('data/citation/citable_pages.json', 'utf8')).pages || [];
const citableByPath = new Map(citable.filter(p => p && p.path).map(p => [p.path, p]));
const llmsCoverageSync = syncLlmsCoverage(activeQueries, citableByPath);
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
const registrySemanticAfterRepair = JSON.stringify({...registry, generated_at: undefined});
const stableContentDate = registry.records
  .flatMap((record) => [record.admitted_at, record.last_reviewed, record.reviewed_at, record.verified_at])
  .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')))
  .sort()
  .at(-1);
registry.generated_at = stableContentDate
  ? `${stableContentDate}T00:00:00.000Z`
  : (registrySemanticAfterRepair === registrySemanticBeforeRepair && registryGeneratedAtBeforeRepair
      ? registryGeneratedAtBeforeRepair
      : '2026-06-21T00:00:00.000Z');
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
  canonical_surface_sync: canonicalSurfaceSync,
  route_manifest_sync: routeManifestSync,
  query_surface_sync: querySurfaceSync,
  llms_coverage_sync: llmsCoverageSync,
  removed: removed.map(r => ({path: r.path, primary_query: r.primary_query, source: r.source}))
}, null, 2)}\n`, 'utf8');
console.log(`[programmatic-registry-owner-repair] PASS: removed=${removed.length}; added=${added}; updated=${updated}; owner_conflict_repairs=${queryOwnerConflictRepairs.length}; citable_sync=${canonicalSurfaceSync.citable_updates}; html_sync=${canonicalSurfaceSync.html_updates}; schema_sync=${canonicalSurfaceSync.schema_updates}; public_route_sync=${routeManifestSync.public_updates}; critical_route_sync=${routeManifestSync.critical_updates}; answer_sync=${querySurfaceSync.answers_updates}; llms_sync=${querySurfaceSync.llms_updates}; llms_coverage_sync=${llmsCoverageSync.llms_updates}; llms_full_sync=${llmsCoverageSync.llms_full_updates}; active=${active.size}; remaining=${registry.records.length}`);
