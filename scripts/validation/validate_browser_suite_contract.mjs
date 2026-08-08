import fs from 'node:fs';
import { readJson, fail, pass, writeSummary } from './common.mjs';

const contract = readJson('config/validation/browser_suite_contract.json').browser_suite;
const critical = readJson(contract.required_route_manifest).routes;
const structural = readJson(contract.full_structural_route_manifest).routes;
const errors = [];

if (!Array.isArray(contract.projects) || contract.projects.length !== 2) errors.push('exactly two browser projects required');
if (contract.expected_collected_policy !== 'critical_route_count_x_2') errors.push('browser count policy must be critical_route_count_x_2');
if (contract.required_failed !== 0 || contract.expected_skipped !== 0) errors.push('failed and skipped counts must be zero');
if (critical.length !== contract.critical_route_count) errors.push(`critical route count ${critical.length} != contract ${contract.critical_route_count}`);
if (structural.length !== contract.full_structural_route_count) errors.push(`structural route count ${structural.length} != contract ${contract.full_structural_route_count}`);
if (critical.length > 12) errors.push(`critical browser suite exceeds 12-route budget: ${critical.length}`);
if (critical.length < 10) errors.push(`critical browser suite is too small for representative coverage: ${critical.length}`);
const criticalManifest = readJson(contract.required_route_manifest);
const requiredDimensions = criticalManifest.required_representative_dimensions || [];
const coveredDimensions = new Set();
for (const route of critical) {
  if (!Array.isArray(route.representative_dimensions) || route.representative_dimensions.length === 0) errors.push(`${route.route_id}: representative_dimensions missing`);
  for (const dimension of route.representative_dimensions || []) coveredDimensions.add(dimension);
}
for (const dimension of requiredDimensions) if (!coveredDimensions.has(dimension)) errors.push(`representative Playwright dimension missing: ${dimension}`);
for (const type of ['howto','concept','comparison','decision']) if (!critical.some(route => route.extraction_type === type)) errors.push(`representative extraction type missing: ${type}`);
if (!critical.some(route => route.canonical_domain === 'billionairehighperformancecoach.com')) errors.push('BHPC domain representative route missing');
if (!critical.some(route => route.canonical_domain === 'spryexecutiveos.com')) errors.push('Spry domain representative route missing');
if (!fs.existsSync('playwright.config.mjs') || !fs.existsSync('tests/public-routes.spec.mjs')) errors.push('Playwright config or route test missing');

const config = fs.readFileSync('playwright.config.mjs', 'utf8');
if (!/maxFailures:\s*1/.test(config)) errors.push('Playwright must stop after the first failure');
if (!/workers:\s*1/.test(config)) errors.push('Playwright worker count must remain 1 for the 8GB local machine');

const expected = critical.length * contract.projects.length;
writeSummary('validate-browser-suite-contract', {
  status: errors.length ? 'FAIL' : 'PASS',
  structural_route_count: structural.length,
  critical_route_count: critical.length,
  project_count: contract.projects.length,
  expected_collected: expected,
  representative_dimension_count: coveredDimensions.size,
  required_representative_dimensions: requiredDimensions,
  errors,
});
if (errors.length) fail(`[validate:browser-suite-contract] FAIL: ${errors.length} issue(s)`, errors);
pass(`[validate:browser-suite-contract] OK: ${structural.length} structurally validated routes; ${critical.length} representative routes × ${contract.projects.length} projects = ${expected} browser checks across ${coveredDimensions.size} dimensions`);
