#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const allowedRootFiles = new Set([
  '.gitignore', '.nvmrc', 'README.md', 'REPO_IDENTITY.md',
  'package.json', 'package-lock.json', 'playwright.config.mjs', 'requirements-validation.txt',
  '_headers', '_redirects', 'robots.txt', 'favicon.ico', 'indexnow.txt',
  'llms.txt', 'llms-full.txt', 'sitemap.xml', 'sitemap-bhpc.xml', 'sitemap-spry.xml',
  'feed.xml', 'feed.json', 'answers.json', 'atlas.json', 'coverage.json',
  'distribution.config.json', 'distribution.config.example.json'
]);
let configuredIndexNowKeyFile = '';
try {
  const distributionConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'distribution.config.json'), 'utf8'));
  configuredIndexNowKeyFile = String(distributionConfig?.indexnow?.key_file || '').trim();
  if (configuredIndexNowKeyFile && path.dirname(configuredIndexNowKeyFile) !== '.') configuredIndexNowKeyFile = '';
} catch {}
if (configuredIndexNowKeyFile) allowedRootFiles.add(configuredIndexNowKeyFile);

const ephemeralRootDirectories = new Set([
  '.auth', '.cache', '.tmp', '.validation-cache', '.validation-runtime', '.wrangler',
  'logs', 'node_modules', 'playwright-report', 'test-results', 'tmp'
]);

const systemDirectories = new Set([
  '.build', '.github', 'LICENSES', 'admin', 'agent', 'answers', 'artifacts', 'assets',
  'brand-defense', 'case-studies', 'clusters', 'comparisons', 'config', 'content',
  'coverage', 'data', 'docs', 'fixtures', 'functions', 'glossary', 'insights',
  'methods', 'models', 'platforms', 'public', 'reports', 'scripts', 'seo', 'sitemaps',
  'templates', 'tests', 'topics', 'use-cases', 'vs', 'whitepapers'
]);

function hasPublicHtml(dir) {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      if (entry.name.startsWith('.') || ['node_modules'].includes(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isFile() && entry.name.endsWith('.html')) return true;
      if (entry.isDirectory()) stack.push(absolute);
    }
  }
  return false;
}

const violations = [];
for (const entry of fs.readdirSync(ROOT, {withFileTypes: true})) {
  const name = entry.name;
  if (name === '.git' || ephemeralRootDirectories.has(name)) continue;
  if (entry.isDirectory()) {
    if (!systemDirectories.has(name) && !hasPublicHtml(path.join(ROOT, name))) {
      violations.push({path: name, reason: 'non-public root directory must be nested'});
    }
    continue;
  }
  if (allowedRootFiles.has(name)) continue;
  if (name.endsWith('.html')) continue;
  if (/^_[a-z0-9_-]+\.json$/i.test(name)) continue;
  violations.push({path: name, reason: 'loose non-public root file must be nested'});
}

const report = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  status: violations.length ? 'FAIL' : 'PASS',
  root_file_count: fs.readdirSync(ROOT, {withFileTypes: true}).filter(entry => entry.isFile()).length,
  root_directory_count: fs.readdirSync(ROOT, {withFileTypes: true}).filter(entry => entry.isDirectory() && entry.name !== '.git' && !ephemeralRootDirectories.has(entry.name)).length,
  violations
};
for (const rel of ['artifacts/validation/root-tree.json', 'reports/root-tree.json']) {
  const absolute = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}
if (violations.length) {
  console.error(`[validate:root-tree] FAIL: ${violations.length} violation(s)`);
  for (const item of violations) console.error(` - ${item.path}: ${item.reason}`);
  process.exit(1);
}
console.log(`[validate:root-tree] PASS: files=${report.root_file_count}; directories=${report.root_directory_count}`);
