'use strict';
// Reconcile derived discovery contracts after the final finite-set renderer.
// Legacy producers run earlier and may still advertise retired source files.
const fs = require('fs');
const { routeFor } = require('./dual_domain_policy.cjs');
const { isRetiredFile, targetFor, keepers } = require('./spry_rescue.cjs');
module.exports = function syncDiscovery(write) {
  const read = file => JSON.parse(fs.readFileSync(file));
  const save = (file, value) => write(file, JSON.stringify(value, null, 2) + '\n');
  const active = read('data/citation/citable_pages.json').pages.filter(p => p.status === 'ACTIVE');
  if (!active.length) throw new Error('No active rescue discovery pages');
  const byPath = new Map(active.map(p => [p.path, p]));
  const admissionPath = 'data/content/page_admission_registry.json';
  const admission = read(admissionPath);
  for (const row of admission.records) {
    const p = byPath.get(row.path);
    if (p) for (const key of ['framework', 'definition', 'extraction_type']) if (p[key]) row[key] = p[key];
  }
  save(admissionPath, admission);
  const routes = active.slice().sort((a,b) => a.path.localeCompare(b.path)).map((p,i) => ({
    route_id: `ROUTE-${String(i+1).padStart(4,'0')}`, path: routeFor(p.path), source_file: p.path,
    canonical_url: p.canonical_url, canonical_domain: new URL(p.canonical_url).hostname,
    h1: p.editorial_title || p.query || '', framework: p.framework || '', safe_controls: ['internal-links'], priority: !!p.priority
  }));
  save('data/routes/public_route_manifest.json', { routes });
  const criticalPath = 'data/routes/critical_browser_route_manifest.json';
  const critical = read(criticalPath);
  for (const row of critical.routes) {
    let p = byPath.get(row.source_file);
    if (!p && isRetiredFile(row.source_file)) {
      const target = targetFor(routeFor(row.source_file));
      p = active.find(p => p.canonical_url === target);
      if (!p) throw new Error('Missing critical replacement: ' + target);
      row.source_file = p.path;
      row.representative_dimensions = row.representative_dimensions.filter(d => !d.startsWith('extraction:') && !d.startsWith('quality:') && !d.startsWith('source:') && !d.startsWith('artifact:') && !d.startsWith('risk:'));
      row.representative_dimensions.push('source:rescue-guide', 'extraction:' + p.extraction_type);
    }
    if (!p) throw new Error('Inactive critical browser route: ' + row.source_file);
    row.representative_dimensions = row.representative_dimensions.map(d => d.startsWith('extraction:') ? 'extraction:'+p.extraction_type : d.startsWith('route:') ? (p.path.endsWith('/index.html') ? 'route:directory-index' : 'route:static-html') : d);
    if (keepers.has(routeFor(p.path))) row.representative_dimensions = [...new Set(row.representative_dimensions.filter(d => !d.startsWith('quality:') && !d.startsWith('source:')).concat('source:rescue-guide'))];
    Object.assign(row, { path: routeFor(p.path), canonical_url: p.canonical_url, canonical_domain: new URL(p.canonical_url).hostname, h1: p.editorial_title || p.query, framework: p.framework, definition: p.definition, extraction_type: p.extraction_type });
  }
  save(criticalPath, critical);
  const contractPath = 'config/validation/browser_suite_contract.json';
  const contract = read(contractPath);
  contract.browser_suite.full_structural_route_count = active.length;
  contract.browser_suite.scope_note = `Real-browser proof covers ${critical.routes.length} representative routes. All ${active.length} active pages remain covered by structural citation, graph, distribution and parity validators.`;
  save(contractPath, contract);
  const phasePath = 'data/citation/citation_phase_manifest.json';
  const phase = read(phasePath);
  phase.current_active_reference_surfaces = active.length;
  save(phasePath, phase);
  const submissionPath = 'data/search/search_engine_submission_manifest.json';
  const submission = read(submissionPath);
  const priorities = read('data/citation/citation_strategy_contract.json').layers.reference_pages.priority_pages;
  const priorityUrls = priorities.map(p => byPath.get(p)?.canonical_url).filter(Boolean);
  for (const key of ['indexnow', 'google_search_console', 'bing_webmaster_tools']) submission[key].priority_urls = priorityUrls;
  submission.missing_from_sitemap = priorityUrls.filter(url => !active.some(p => p.canonical_url === url));
  save(submissionPath, submission);
  // A retired archive must never be restored over a newly reviewed edition.
  const frozenPath = 'data/release/frozen_output_registry.json';
  const frozen = read(frozenPath);
  for (const [route, record] of Object.entries(frozen.records)) if (isRetiredFile(record.path)) delete frozen.records[route];
  save(frozenPath, frozen);
  // Derive dates only after every HTML mutation at this publishing boundary.
  require('child_process').execFileSync(process.execPath, ['scripts/sitemap_content_lastmod.mjs'], {stdio:'pipe'});
};
