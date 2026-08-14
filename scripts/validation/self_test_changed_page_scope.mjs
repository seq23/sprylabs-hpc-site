#!/usr/bin/env node
import {buildScope, routeFromPath} from './page_scope.mjs';

const citable = new Set([
  'how-to-plan-your-day/index.html',
  'comparisons/bhpc-vs-hone.html',
  'unrelated-stale-page/index.html'
]);
const cases = [];
function check(name, fn) {
  try { fn(); cases.push({name, status: 'PASS'}); }
  catch (error) { cases.push({name, status: 'FAIL', error: error.message}); }
}
function expect(actual, expected, message) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}: expected ${e}, got ${a}`);
}
check('unrelated workflow does not inherit global page debt', () => {
  const s = buildScope({changedFiles:['reports/search/status.json'], citablePaths:citable});
  expect(s.paths, [], 'page scope');
});
check('site public HowTo change scopes exactly one page', () => {
  const s = buildScope({changedFiles:['site/public/how-to-plan-your-day/index.html'], citablePaths:citable});
  expect(s.paths, ['how-to-plan-your-day/index.html'], 'HowTo scope');
});
check('comparison page change scopes exactly one page', () => {
  const s = buildScope({changedFiles:['site/public/comparisons/bhpc-vs-hone.html'], citablePaths:citable});
  expect(s.paths, ['comparisons/bhpc-vs-hone.html'], 'comparison scope');
});
check('explicit mutation authority constrains repair without hiding audit', () => {
  const authorized = new Set([routeFromPath('how-to-plan-your-day/index.html')]);
  const s = buildScope({changedFiles:['site/public/how-to-plan-your-day/index.html','site/public/comparisons/bhpc-vs-hone.html'], citablePaths:citable, authorizedRoutes:authorized});
  expect(s.paths, ['comparisons/bhpc-vs-hone.html','how-to-plan-your-day/index.html'], 'audit scope');
  expect(s.repair_paths, ['how-to-plan-your-day/index.html'], 'repair scope');
  expect(s.unrepairable_changed_paths, ['comparisons/bhpc-vs-hone.html'], 'unauthorized mutation visibility');
});
check('zero citable page changes remain a valid empty scope', () => {
  const s = buildScope({changedFiles:['scripts/search_intelligence/status.mjs','reports/agency/status.json'], citablePaths:citable});
  expect(s.paths, [], 'empty scope');
});
const failed = cases.filter(x => x.status !== 'PASS');
if (failed.length) {
  console.error('[validation:changed-page-scope:self-test] FAIL');
  for (const x of failed) console.error(` - ${x.name}: ${x.error}`);
  process.exit(1);
}
console.log(`[validation:changed-page-scope:self-test] PASS: ${cases.length} fixtures`);
