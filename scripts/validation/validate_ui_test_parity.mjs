import fs from 'node:fs';
import { readJson, fail, pass, writeSummary } from './common.mjs';

const allRoutes = readJson('data/routes/public_route_manifest.json').routes;
const criticalRoutes = readJson('data/routes/critical_browser_route_manifest.json').routes;
const pages = readJson('data/citation/citable_pages.json').pages.filter(page => page.status === 'ACTIVE');
const priority = readJson('data/citation/priority_page_acceptance.json').pages;
const manual = readJson('data/citation/manual_expansion_acceptance.json').pages;
const errors = [];

if (allRoutes.length !== pages.length) errors.push(`public route count ${allRoutes.length} != active pages ${pages.length}`);
if (criticalRoutes.length !== 12) errors.push(`critical browser route count must be 12, found ${criticalRoutes.length}`);
if (priority.length !== 24) errors.push(`priority citation acceptance count must be 24, found ${priority.length}`);

const byPath = new Map(pages.map(page => [page.path, page]));
for (const route of allRoutes) {
  const page = byPath.get(route.source_file);
  if (!page) errors.push(`${route.route_id}: source not active`);
  else {
    if (route.h1 !== page.query) errors.push(`${route.route_id}: H1 drift`);
    if (route.framework !== page.framework) errors.push(`${route.route_id}: framework drift`);
  }
}

const criticalSources = new Set();
for (const route of criticalRoutes) {
  if (criticalSources.has(route.source_file)) errors.push(`duplicate critical route: ${route.source_file}`);
  criticalSources.add(route.source_file);
  const page = byPath.get(route.source_file);
  if (!page) errors.push(`${route.route_id}: critical source not active`);
  else {
    if (route.h1 !== page.query) errors.push(`${route.route_id}: critical H1 drift`);
    if (route.framework !== page.framework) errors.push(`${route.route_id}: critical framework drift`);
    if (route.definition !== page.definition) errors.push(`${route.route_id}: critical definition drift`);
    if (route.extraction_type !== page.extraction_type) errors.push(`${route.route_id}: critical extraction type drift`);
  }
}

const exactPaths = new Set([...priority, ...manual].map(page => page.path));
for (const source of criticalSources) if (!exactPaths.has(source)) errors.push(`critical route is not governed by an exact acceptance contract: ${source}`);

const test = fs.readFileSync('tests/public-routes.spec.mjs', 'utf8');
for (const token of [
  'data/routes/critical_browser_route_manifest.json',
  'priority_page_acceptance.json',
  'manual_expansion_acceptance.json',
  'citation-definition',
  'data-llm-answer',
  'data-extraction-type',
  'data-named-framework',
  'product-anchor',
  'CITATION_PAGE_SCHEMA',
  'download.html',
  'longParagraphs',
  'scrollWidth',
  'consoleErrors',
  'pageErrors',
  'failedRequests',
]) if (!test.includes(token)) errors.push(`browser test missing contractual assertion token: ${token}`);

writeSummary('validate-ui-test-parity', {
  status: errors.length ? 'FAIL' : 'PASS',
  structural_routes: allRoutes.length,
  priority_pages: priority.length,
  manual_expansion_pages: manual.length,
  critical_browser_routes: criticalRoutes.length,
  errors,
});
if (errors.length) fail(`[validate:ui-test-parity] FAIL: ${errors.length} issue(s)`, errors);
pass(`[validate:ui-test-parity] OK: ${allRoutes.length} structural routes, ${priority.length} priority contracts, ${manual.length} manual expansion contracts, ${criticalRoutes.length} critical browser routes`);
