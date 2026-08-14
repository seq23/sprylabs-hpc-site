#!/usr/bin/env node
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const matrix = JSON.parse(fs.readFileSync('_repo_validation_matrix.json', 'utf8'));
const registry = JSON.parse(fs.readFileSync('_validation_registry.json', 'utf8'));
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}
function pageSteps(profileName) {
  const profile = matrix.profiles?.[profileName];
  if (!profile) {
    failures.push(`missing validation profile: ${profileName}`);
    return [];
  }
  return (profile.steps || []).filter(step => /PAGE-AUDIT/.test(step.id || ''));
}
function registryRow(id) {
  return (registry.records || []).find(row => row.validation_id === id);
}

expect(pkg.scripts?.['validate:incremental-page-audit'] === 'node scripts/validation/run_incremental_page_audit.mjs',
  'package script validate:incremental-page-audit must use the incremental entrypoint');
expect(pkg.scripts?.['validate:full-page-audit'] === 'node scripts/validation/run_full_page_audit.mjs',
  'package script validate:full-page-audit must use the full entrypoint');

const changed = pageSteps('changed');
expect(changed.length === 1 && changed[0].id === 'VAL-INCREMENTAL-PAGE-AUDIT' && changed[0].command === 'npm run validate:incremental-page-audit',
  'changed profile must contain exactly the incremental page audit');

const prepush = pageSteps('container-prepush');
expect(prepush.length === 1 && prepush[0].id === 'VAL-FULL-PAGE-AUDIT' && prepush[0].command === 'npm run validate:full-page-audit',
  'container-prepush profile must contain exactly the full page audit');

const fullAudit = pageSteps('full-audit');
expect(fullAudit.length === 1 && fullAudit[0].id === 'VAL-FULL-PAGE-AUDIT' && fullAudit[0].command === 'npm run validate:full-page-audit',
  'full-audit profile must contain exactly the full page audit');

const incRow = registryRow('VAL-INCREMENTAL-PAGE-AUDIT');
const fullRow = registryRow('VAL-FULL-PAGE-AUDIT');
expect(Boolean(incRow), 'validation registry missing VAL-INCREMENTAL-PAGE-AUDIT');
expect(Boolean(fullRow), 'validation registry missing VAL-FULL-PAGE-AUDIT');
if (incRow) {
  expect(incRow.implementation_path === 'scripts/validation/run_incremental_page_audit.mjs',
    'incremental registry implementation path must be the incremental entrypoint');
  expect(incRow.evidence_output === 'artifacts/validation/incremental-page-audit.json',
    'incremental registry evidence must be incremental-page-audit.json');
}
if (fullRow) {
  expect(fullRow.implementation_path === 'scripts/validation/run_full_page_audit.mjs',
    'full registry implementation path must be the full entrypoint');
  expect(fullRow.evidence_output === 'artifacts/validation/full-page-audit.json',
    'full registry evidence must be full-page-audit.json');
}

if (failures.length) {
  console.error('[validation:page-audit-profile-routing:self-test] FAIL');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('[validation:page-audit-profile-routing:self-test] PASS');
