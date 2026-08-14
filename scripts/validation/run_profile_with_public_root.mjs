#!/usr/bin/env node
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {captureChangedPageScope, DEFAULT_SCOPE_FILE} from './page_scope.mjs';

const args = process.argv.slice(2);
const profile = args[0];
if (!profile) {
  console.error('usage: npm run validate:profile -- <profile>');
  process.exit(2);
}
const env = {...process.env};
if (profile === 'changed') {
  const scope = captureChangedPageScope({output: DEFAULT_SCOPE_FILE});
  if (scope.status !== 'READY') {
    console.error(`[validate:profile] INTERNAL_ERROR: ${scope.reason || 'changed-page scope unavailable'}`);
    process.exit(2);
  }
  env.VALIDATION_PAGE_SCOPE_FILE = path.resolve(DEFAULT_SCOPE_FILE);
  console.log(`[validate:profile:changed] page_scope=${scope.paths.length}; repairable=${scope.repair_paths.length}; source=${scope.source}`);
}
const r = spawnSync(process.execPath, [
  'scripts/site_layout/run_with_public_root.mjs', '--', process.execPath, 'scripts/validation/validate_profile.mjs', ...args
], {stdio: 'inherit', env});
process.exit(r.status ?? 2);
