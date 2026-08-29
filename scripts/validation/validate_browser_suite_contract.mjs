import fs from 'node:fs';
import { readJson, fail, pass, writeSummary } from './common.mjs';

const contract = readJson('config/validation/browser_suite_contract.json').browser_suite;
const critical = readJson(contract.required_route_manifest).routes;
const structural = readJson(contract.full_structural_route_manifest).routes;
const errors = [];

if (!Array.isArray(contract.projects) || contract.projects.length !== 2) {
  errors.push('exactly two browser projects required');
}

if (contract.expected_collected_policy !== 'critical_route_count_x_2') {
  errors.push('browser count policy must be critical_route_count_x_2');
}

if (contract.required_failed !== 0 || contract.expected_skipped !== 0) {
  errors.push('failed and skipped counts must be zero');
}

if (critical.length !== contract.critical_route_count) {
  errors.push(
    `critical route count ${critical.length} != contract ${contract.critical_route_count}`
  );
}

if (structural.length !== contract.full_structural_route_count) {
  errors.push(
    `structural route count ${structural.length} != contract ${contract.full_structural_route_count}`
  );
}

if (critical.length > 12) {
  errors.push(
    `critical browser suite exceeds 12-route budget: ${critical.length}`
  );
}

if (critical.length < 10) {
  errors.push(
    `critical browser suite is too small for representative coverage: ${critical.length}`
  );
}

const criticalManifest = readJson(contract.required_route_manifest);
const requiredDimensions =
  criticalManifest.required_representative_dimensions || [];
const coveredDimensions = new Set();

for (const route of critical) {
  if (
    !Array.isArray(route.representative_dimensions) ||
    route.representative_dimensions.length === 0
  ) {
    errors.push(`${route.route_id}: representative_dimensions missing`);
  }

  for (const dimension of route.representative_dimensions || []) {
    coveredDimensions.add(dimension);
  }
}

for (const dimension of requiredDimensions) {
  if (!coveredDimensions.has(dimension)) {
    errors.push(`representative Playwright dimension missing: ${dimension}`);
  }
}

for (const type of ['howto', 'concept', 'comparison', 'decision']) {
  if (!critical.some(route => route.extraction_type === type)) {
    errors.push(`representative extraction type missing: ${type}`);
  }
}

if (
  !critical.some(
    route =>
      route.canonical_domain === 'billionairehighperformancecoach.com'
  )
) {
  errors.push('BHPC domain representative route missing');
}

if (
  !critical.some(route => route.canonical_domain === 'spryexecutiveos.com')
) {
  errors.push('Spry domain representative route missing');
}

if (
  !fs.existsSync('playwright.config.mjs') ||
  !fs.existsSync('tests/public-routes.spec.mjs')
) {
  errors.push('Playwright config or route test missing');
}

if (fs.existsSync('playwright.config.mjs')) {
  const config = fs.readFileSync('playwright.config.mjs', 'utf8');

  if (!/maxFailures:\s*1/.test(config)) {
    errors.push('Playwright must stop after the first failure');
  }

  if (!/workers:\s*1/.test(config)) {
    errors.push(
      'Playwright worker count must remain 1 for the 8GB local machine'
    );
  }
}

/*
 * Dependency consistency contract.
 *
 * @playwright/test is the repo-owned test runner and its corresponding
 * playwright dependency must remain version-aligned in package-lock.json.
 */
if (!fs.existsSync('package.json') || !fs.existsSync('package-lock.json')) {
  errors.push('package.json and package-lock.json are required');
} else {
  const packageJson = readJson('package.json');
  const packageLock = readJson('package-lock.json');

  const declaredPlaywrightTest =
    packageJson.devDependencies?.['@playwright/test'] || '';

  const lockedPlaywrightTest =
    packageLock.packages?.['node_modules/@playwright/test']?.version || '';

  const lockedPlaywright =
    packageLock.packages?.['node_modules/playwright']?.version || '';

  const lockedPlaywrightCore =
    packageLock.packages?.['node_modules/playwright-core']?.version || '';

  if (!declaredPlaywrightTest) {
    errors.push('@playwright/test must be declared in devDependencies');
  }

  if (!lockedPlaywrightTest) {
    errors.push('@playwright/test must be present in package-lock.json');
  }

  if (!lockedPlaywright) {
    errors.push('playwright must be present in package-lock.json');
  }

  if (!lockedPlaywrightCore) {
    errors.push('playwright-core must be present in package-lock.json');
  }

  if (
    lockedPlaywrightTest &&
    lockedPlaywright &&
    lockedPlaywrightTest !== lockedPlaywright
  ) {
    errors.push(
      `Playwright version mismatch: @playwright/test=${lockedPlaywrightTest} playwright=${lockedPlaywright}`
    );
  }

  if (
    lockedPlaywright &&
    lockedPlaywrightCore &&
    lockedPlaywright !== lockedPlaywrightCore
  ) {
    errors.push(
      `Playwright version mismatch: playwright=${lockedPlaywright} playwright-core=${lockedPlaywrightCore}`
    );
  }
}

const expected = critical.length * contract.projects.length;

writeSummary('validate-browser-suite-contract', {
  status: errors.length ? 'FAIL' : 'PASS',
  structural_route_count: structural.length,
  critical_route_count: critical.length,
  project_count: contract.projects.length,
  expected_collected: expected,
  representative_dimension_count: coveredDimensions.size,
  required_representative_dimensions: requiredDimensions,
  playwright_runtime_contract: {
    // The postdeploy public click-audit workflow was removed on 2026-08-29 by
    // owner decision. npm ci remains the Playwright version authority for the
    // local real-browser proof, which is now the only browser lane.
    workflow: null,
    package_install_authority: 'npm-ci',
    independent_playwright_package_install_allowed: false,
  },
  errors,
});

if (errors.length) {
  fail(
    `[validate:browser-suite-contract] FAIL: ${errors.length} issue(s)`,
    errors
  );
}

pass(
  `[validate:browser-suite-contract] OK: ${structural.length} structurally validated routes; ${critical.length} representative routes × ${contract.projects.length} projects = ${expected} browser checks across ${coveredDimensions.size} dimensions; Playwright runtime is repo-pinned`
);
