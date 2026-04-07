const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const BUILD_DIR = path.join(ROOT, '.build');
const REQUIRED_FILES = [
  'distribution_scripts/indexnow_submit.sh',
  'distribution_scripts/gsc_submit_sitemaps.py',
  'distribution_scripts/gsc_inspect_urls.py',
  'distribution_scripts/deploy_distribution.sh',
  'scripts/prepare_distribution_artifacts.js',
  '_ops/validators/validate_distribution_contract.js',
  '.build/indexnow-priority.txt',
  '.build/indexnow-batch.txt',
  '.build/distribution-priority-urls.txt',
  '.build/distribution-readme.txt',
  '.build/distribution-manifest.json',
  'sitemap.xml',
  'sitemap-spry.xml',
  'sitemap-bhpc.xml',
  'robots.txt'
];
const ALLOWED_HOSTS = new Set([
  'https://spryexecutiveos.com',
  'https://billionairehighperformancecoach.com'
]);

function fail(message) {
  console.error(`validate_distribution_contract failed: ${message}`);
  process.exit(1);
}

for (const rel of REQUIRED_FILES) {
  if (!fs.existsSync(path.join(ROOT, rel))) fail(`missing required file ${rel}`);
}

const priority = fs.readFileSync(path.join(BUILD_DIR, 'indexnow-priority.txt'), 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const batch = fs.readFileSync(path.join(BUILD_DIR, 'indexnow-batch.txt'), 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const priorityMirror = fs.readFileSync(path.join(BUILD_DIR, 'distribution-priority-urls.txt'), 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
if (!priority.length) fail('priority url list is empty');
if (!batch.length) fail('batch url list is empty');
if (priority.length > 40) fail(`priority url list too large (${priority.length})`);
const batchSet = new Set(batch);
for (const url of priority) {
  if (!batchSet.has(url)) fail(`priority url missing from batch: ${url}`);
}
if (JSON.stringify(priority) !== JSON.stringify(priorityMirror)) fail('distribution-priority-urls.txt must mirror indexnow-priority.txt');
for (const listName of ['priority', 'batch']) {
  const list = listName === 'priority' ? priority : batch;
  for (const url of list) {
    try {
      const parsed = new URL(url);
      const host = `${parsed.protocol}//${parsed.host}`;
      if (!ALLOWED_HOSTS.has(host)) fail(`${listName} list has unexpected host ${host}`);
      if (parsed.protocol !== 'https:') fail(`${listName} list has non-https url ${url}`);
    } catch {
      fail(`${listName} list contains invalid URL ${url}`);
    }
  }
}

const deployScript = fs.readFileSync(path.join(ROOT, 'distribution_scripts', 'deploy_distribution.sh'), 'utf8');
for (const required of ['sitemap.xml', 'sitemap-spry.xml', 'sitemap-bhpc.xml']) {
  if (!deployScript.includes(required)) fail(`deploy script missing sitemap reference ${required}`);
}
if (deployScript.includes('sitemap-fresh.xml')) fail('deploy script must not reference sitemap-fresh.xml');

const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
if (!robots.includes('https://billionairehighperformancecoach.com/sitemap-bhpc.xml')) fail('robots.txt missing bhpc sitemap');
if (!robots.includes('https://spryexecutiveos.com/sitemap-spry.xml')) fail('robots.txt missing spry sitemap');
if (robots.includes('sitemap-fresh.xml')) fail('robots.txt must not reference sitemap-fresh.xml');

const shellScripts = ['distribution_scripts/indexnow_submit.sh', 'distribution_scripts/deploy_distribution.sh'];
for (const rel of shellScripts) {
  const mode = fs.statSync(path.join(ROOT, rel)).mode & 0o111;
  if (!mode) fail(`${rel} is not executable`);
}

console.log(`validate_distribution_contract: OK (${priority.length} priority urls, ${batch.length} batch urls)`);
