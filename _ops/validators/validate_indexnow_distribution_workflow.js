#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const reportPath = path.join(root, 'reports', 'validate_indexnow_distribution_workflow.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const failures = [];
function exists(p) { return fs.existsSync(path.join(root, p)); }
function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }
function requireFile(p) { if (!exists(p)) failures.push(`missing required file: ${p}`); }
function includes(file, needle, label = needle) {
  if (!exists(file)) return;
  const source = read(file);
  if (!source.includes(needle)) failures.push(`${file} does not include ${label}`);
}

const required = [
  '.github/workflows/deploy-distribution.yml',
  'distribution_scripts/indexnow_submit.sh',
  'distribution_scripts/deploy_distribution.sh',
  'scripts/prepare_distribution_artifacts.js',
  'distribution.config.json',
  '.build/indexnow-priority.txt',
  '.build/indexnow-batch.txt',
  '.build/distribution-manifest.json',
  'reports/indexnow-submit-report.json'
];
required.forEach(requireFile);

includes('.github/workflows/deploy-distribution.yml', 'branches: [main]', 'push-to-main trigger');
includes('.github/workflows/deploy-distribution.yml', 'workflow_dispatch', 'manual dispatch trigger');
includes('.github/workflows/deploy-distribution.yml', 'npm run distribution:prepare', 'distribution prepare step');
includes('.github/workflows/deploy-distribution.yml', 'npm run validate:indexnow-workflow', 'IndexNow validator step');
includes('.github/workflows/deploy-distribution.yml', 'npm run distribution:deploy', 'distribution deploy step');
includes('.github/workflows/deploy-distribution.yml', '--allow-mixed', 'mixed-host IndexNow mode');
includes('.github/workflows/deploy-distribution.yml', 'INDEXNOW_KEY', 'INDEXNOW_KEY secret');
includes('.github/workflows/deploy-distribution.yml', 'INDEXNOW_DRY_RUN=1', 'missing-secret dry run report path');
includes('.github/workflows/deploy-distribution.yml', 'reports/indexnow-submit-report.json', 'report artifact upload');

includes('distribution_scripts/indexnow_submit.sh', 'INDEXNOW_DRY_RUN', 'dry-run support');
includes('distribution_scripts/indexnow_submit.sh', 'reports/indexnow-submit-report.json', 'default report path');
includes('distribution_scripts/indexnow_submit.sh', 'distribution.config.json', 'config fallback');
includes('distribution_scripts/indexnow_submit.sh', 'allow_mixed', 'mixed-host support');
includes('distribution_scripts/indexnow_submit.sh', 'chunk_size', 'chunking support');

includes('distribution_scripts/deploy_distribution.sh', 'IndexNow is the guaranteed first-class lane', 'IndexNow-first contract');
includes('distribution_scripts/deploy_distribution.sh', 'GSC skipped', 'GSC optional skip messaging');
includes('distribution_scripts/deploy_distribution.sh', '|| true', 'GSC non-blocking behavior');

let config = null;
if (exists('distribution.config.json')) {
  try { config = JSON.parse(read('distribution.config.json')); }
  catch (err) { failures.push(`distribution.config.json does not parse: ${err.message}`); }
}
if (config) {
  const hosts = config?.indexnow?.hosts || [];
  for (const host of ['spryexecutiveos.com', 'billionairehighperformancecoach.com']) {
    if (!hosts.includes(host)) failures.push(`distribution.config.json missing host: ${host}`);
  }
  if (config?.indexnow?.priority_file !== '.build/indexnow-priority.txt') failures.push('indexnow.priority_file must be .build/indexnow-priority.txt');
  if (config?.indexnow?.batch_file !== '.build/indexnow-batch.txt') failures.push('indexnow.batch_file must be .build/indexnow-batch.txt');
  if (!config?.indexnow?.key || !config?.indexnow?.key_file) failures.push('indexnow key/key_file must be configured');
  if (config?.indexnow?.key_file && exists(config.indexnow.key_file)) {
    const actual = read(config.indexnow.key_file).trim();
    if (actual !== config.indexnow.key) failures.push(`configured key_file does not match indexnow.key: ${config.indexnow.key_file}`);
  }
}

function parseUrls(file) {
  if (!exists(file)) return [];
  return read(file).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
}
const priority = parseUrls('.build/indexnow-priority.txt');
const batch = parseUrls('.build/indexnow-batch.txt');
if (!priority.length) failures.push('.build/indexnow-priority.txt is empty');
if (!batch.length) failures.push('.build/indexnow-batch.txt is empty');
const allowedHosts = new Set(['spryexecutiveos.com', 'billionairehighperformancecoach.com']);
for (const [label, urls] of [['priority', priority], ['batch', batch]]) {
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (!allowedHosts.has(parsed.host)) failures.push(`${label} URL has unexpected host: ${url}`);
    } catch {
      failures.push(`${label} URL is invalid: ${url}`);
    }
  }
}
if (priority.length && batch.length) {
  const batchSet = new Set(batch);
  for (const url of priority) if (!batchSet.has(url)) failures.push(`priority URL missing from batch: ${url}`);
}

const report = {
  ok: failures.length === 0,
  checked_at: new Date().toISOString(),
  workflow: '.github/workflows/deploy-distribution.yml',
  priorityCount: priority.length,
  batchCount: batch.length,
  hosts: Array.from(new Set([...priority, ...batch].map(u => { try { return new URL(u).host; } catch { return 'invalid'; } }))).sort(),
  failures
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
if (failures.length) {
  console.error('IndexNow distribution workflow contract FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`IndexNow distribution workflow contract OK: priority=${priority.length} batch=${batch.length}`);
