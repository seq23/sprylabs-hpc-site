#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const req = [
  'distribution.config.json',
  'distribution.config.example.json',
  'distribution_scripts/bootstrap_distribution.sh',
  'distribution_scripts/indexnow_submit.sh',
  'distribution_scripts/gsc_submit_sitemaps.py',
  'distribution_scripts/gsc_inspect_urls.py',
  'distribution_scripts/deploy_distribution.sh',
  'distribution_scripts/distribution_common.py',
  'scripts/prepare_distribution_artifacts.js',
  '.build/indexnow-priority.txt',
  '.build/indexnow-batch.txt',
  '.build/distribution-priority-urls.txt',
  '.build/distribution-manifest.json',
  '.build/distribution-readme.txt'
];
function fail(msg) { console.error(`DISTRIBUTION CONTRACT FAIL: ${msg}`); process.exit(1); }
for (const file of req) if (!fs.existsSync(path.join(root, file))) fail(`missing required file: ${file}`);
if (fs.existsSync(path.join(root, 'distribution_scripts', '__pycache__'))) fail('distribution_scripts/__pycache__ must not be committed');
const config = JSON.parse(fs.readFileSync(path.join(root, 'distribution.config.json'), 'utf8'));
for (const host of ['spryexecutiveos.com', 'billionairehighperformancecoach.com']) {
  if (!config.indexnow.hosts.includes(host)) fail(`missing host ${host}`);
}
const chunkSize = Number(config.indexnow.chunk_size || 0);
if (!Number.isInteger(chunkSize) || chunkSize <= 0) fail('indexnow.chunk_size must be a positive integer');
for (const site of config.gsc.sites) {
  if (!site.host || !site.site_url || !Array.isArray(site.sitemaps) || !site.sitemaps.length) fail('invalid gsc.sites entry');
}
const allowed = new Set(['https://spryexecutiveos.com/sitemap-spry.xml','https://billionairehighperformancecoach.com/sitemap-bhpc.xml']);
for (const site of config.gsc.sites) for (const sm of site.sitemaps) if (!allowed.has(sm)) fail(`unexpected sitemap in config: ${sm}`);
const priority = fs.readFileSync(path.join(root, '.build/indexnow-priority.txt'), 'utf8').trim().split(/\n+/).filter(Boolean);
const batch = fs.readFileSync(path.join(root, '.build/indexnow-batch.txt'), 'utf8').trim().split(/\n+/).filter(Boolean);
if (!priority.length || !batch.length) fail('priority or batch file is empty');
if (priority.length > 40) fail(`priority list too large: ${priority.length}`);
const pset = new Set(priority);
if (pset.size !== priority.length) fail('priority list contains duplicates');
for (const url of priority) if (!batch.includes(url)) fail(`priority URL missing from batch: ${url}`);
const key = (config.indexnow.key || '').trim();
const keyFile = (config.indexnow.key_file || '').trim();
if (!key || !keyFile) fail('indexnow key and key_file must be committed and non-empty');
const keyPath = path.join(root, keyFile);
if (!fs.existsSync(keyPath)) fail(`configured key file missing: ${keyFile}`);
const content = fs.readFileSync(keyPath, 'utf8').trim();
if (content !== key) fail(`configured key file mismatch: ${keyFile}`);
const bootstrapSource = fs.readFileSync(path.join(root, 'distribution_scripts', 'bootstrap_distribution.sh'), 'utf8');
if (!bootstrapSource.includes('BOOTSTRAP_NOOP')) fail('bootstrap script must preserve committed IndexNow keys by default');
console.log(`DISTRIBUTION CONTRACT PASS: priority=${priority.length} batch=${batch.length} chunk_size=${chunkSize} key_file=${keyFile}`);

process.exit(0);
