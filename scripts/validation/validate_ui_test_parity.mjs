import fs from 'node:fs';
import { readJson, fail, pass, writeSummary } from './common.mjs';

const allRoutes = readJson('data/routes/public_route_manifest.json').routes;
const criticalRoutes = readJson('data/routes/critical_browser_route_manifest.json').routes;
const pages = readJson('data/citation/citable_pages.json').pages.filter(page => page.status === 'ACTIVE');
const priority = readJson('data/citation/priority_page_acceptance.json').pages;
const manual = readJson('data/citation/manual_expansion_acceptance.json').pages;
const errors = [];

if (allRoutes.length !== pages.length) errors.push(`public route count ${allRoutes.length} != active pages ${pages.length}`);
// Floors, not frozen counts: adding a critical route or a priority acceptance row
// is the pipeline working. Losing them is the regression worth failing on.
const CRITICAL_ROUTE_FLOOR = 12;
if (criticalRoutes.length < CRITICAL_ROUTE_FLOOR) errors.push(`critical browser routes regressed below floor ${CRITICAL_ROUTE_FLOOR}, found ${criticalRoutes.length}`);
const PRIORITY_FLOOR = 24;
if (priority.length < PRIORITY_FLOOR) errors.push(`priority citation acceptance regressed below floor ${PRIORITY_FLOOR}, found ${priority.length}`);

// A framework name is the name of a thing the page teaches. Two other kinds of
// string kept ending up in the field, and the drift checks below could not see
// either of them, because manifest and registry agreed - they were both wrong in
// the same way, copied from the same bad data-named-framework:
//
//   "how to use chatgpt as a daily accountability partner for founders"
//     - the page title, which is route.h1's job.
//   "The 3-Part Email System with H3s for Filter Batch and Triage each with 2-3
//    sentence definitions"
//     - an audit row's layout brief for an editor. Same leak as the operator
//       critique that reached live page copy; this file was just another place
//       it surfaced, and here it broke the Postdeploy Public Audit instead,
//       because tests/public-routes.spec.mjs asserts the deployed page's
//       citation-definition opening contains this string and no real page says
//       "with H3s for".
//
// The postdeploy audit is the only check that fetches deployed pages, so it is
// the last place a fault should first be noticed. Catch the shape here.
const LAYOUT_BRIEF = /\bwith\s+(?:numbered\s+)?h[1-6]s?\b|\beach\s+with\s+[\d\u2013-]+\s*(?:to\s*\d+\s*)?sentences?\b/i;
const BRAND_SUFFIX = /\s+[\u2014|-]\s+(?:Spry Executive OS|Billionaire High Performance Coach)\b/i;
const MAX_FRAMEWORK_WORDS = 12;
function frameworkShapeError(label, framework) {
  const value = String(framework || '').trim();
  if (!value) return `${label}: framework is empty`;
  if (LAYOUT_BRIEF.test(value)) return `${label}: framework carries a layout brief, not a framework name: ${JSON.stringify(value)}`;
  if (BRAND_SUFFIX.test(value)) return `${label}: framework carries a page-title brand suffix: ${JSON.stringify(value)}`;
  if (value.split(/\s+/).length > MAX_FRAMEWORK_WORDS) return `${label}: framework is ${value.split(/\s+/).length} words, which is a sentence rather than a name: ${JSON.stringify(value)}`;
  // Not "framework equals the H1": /continuity-collapse-pattern/ is a page named
  // after the framework it teaches, and its H1, framework and data-named-framework
  // are all correctly "Continuity Collapse Pattern".
  //
  // What separates a name from a title is that a name is a name. Every genuine
  // value in this manifest is a capitalised noun phrase; the bad one was
  // "how to use chatgpt as a daily accountability partner for founders" - a
  // lower-case question, and short enough (11 words) to slip under the length
  // rule above.
  if (!/[A-Z]/.test(value)) return `${label}: framework has no capitalised word, so it is a phrase rather than a name: ${JSON.stringify(value)}`;
  if (/^(?:how\s+to|what\s+is|what\s+are|why\s|when\s+to|where\s|can\s+i|should\s+i|best\s)/i.test(value)) return `${label}: framework reads as a search query, not a framework name: ${JSON.stringify(value)}`;
  return null;
}

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
    const shape = frameworkShapeError(route.route_id, route.framework);
    if (shape) errors.push(shape);
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
