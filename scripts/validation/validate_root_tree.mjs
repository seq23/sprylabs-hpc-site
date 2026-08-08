#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

// Root policy is semantic, not a tiny brittle filename whitelist. Public web-root
// assets, repo/operator authority, and the updater/bootstrap contracts may live at
// root. Domain-specific internal contracts belong under config/ or data/.
const allowedRootFiles = new Set([
  '.gitignore', '.nvmrc', 'AGENTS.md', 'README.md', 'REPO_IDENTITY.md',
  'package.json', 'package-lock.json', 'playwright.config.mjs', 'requirements-validation.txt',
  '_headers', '_redirects', 'robots.txt', 'favicon.ico', 'indexnow.txt',
  'llms.txt', 'llms-full.txt', 'sitemap.xml', 'sitemap-bhpc.xml', 'sitemap-spry.xml',
  'feed.xml', 'feed.json', 'answers.json', 'atlas.json', 'coverage.json',
  'distribution.config.json', 'distribution.config.example.json',
  // Stable generic-updater / validation-control-plane interfaces.
  '_artifact_validation_manifest.json', '_baseline_packaging_contract.json',
  '_repo_lifecycle_profile.json', '_repo_update_contract.json',
  '_repo_validation_matrix.json', '_validation_bootstrap.json', '_validation_registry.json'
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
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const absolute = path.join(current, entry.name);
      if (entry.isFile() && entry.name.endsWith('.html')) return true;
      if (entry.isDirectory()) stack.push(absolute);
    }
  }
  return false;
}

function isSecretLike(name) {
  const lower = name.toLowerCase();
  if (/^\.env(?:\.|$)/.test(lower) && !/\.example$/.test(lower)) return true;
  if (/^(?:id_rsa|id_ed25519|credentials|secrets?)(?:\.|$)/.test(lower)) return true;
  if (/\.(?:pem|p12|pfx|private-key|secret-key)$/.test(lower)) return true;
  return false;
}

const violations = [];
const warnings = [];
for (const entry of fs.readdirSync(ROOT, {withFileTypes: true})) {
  const name = entry.name;
  if (name === '.git' || ephemeralRootDirectories.has(name)) continue;

  if (entry.isDirectory()) {
    if (!systemDirectories.has(name) && !hasPublicHtml(path.join(ROOT, name))) {
      warnings.push({path: name, reason: 'non-public root directory should be nested'});
    }
    continue;
  }

  if (isSecretLike(name)) {
    violations.push({path: name, reason: 'secret-like or credential material must never be committed at repository root'});
    continue;
  }
  if (allowedRootFiles.has(name)) continue;
  if (name.endsWith('.html')) continue;

  // Unknown root clutter is cleanup debt, not a release blocker by itself.
  warnings.push({path: name, reason: 'non-public root file should be nested or explicitly admitted'});
}

const report = {
  schema_version: '1.1',
  generated_at: new Date().toISOString(),
  status: violations.length ? 'FAIL' : warnings.length ? 'WARN' : 'PASS',
  root_file_count: fs.readdirSync(ROOT, {withFileTypes: true}).filter(entry => entry.isFile()).length,
  root_directory_count: fs.readdirSync(ROOT, {withFileTypes: true}).filter(entry => entry.isDirectory() && entry.name !== '.git' && !ephemeralRootDirectories.has(entry.name)).length,
  violations,
  warnings
};
for (const rel of ['artifacts/validation/root-tree.json', 'reports/root-tree.json']) {
  const absolute = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

if (violations.length) {
  console.error(`[validate:root-tree] FAIL: ${violations.length} violation(s); warnings=${warnings.length}`);
  for (const item of violations) console.error(` - ${item.path}: ${item.reason}`);
  process.exit(1);
}
if (warnings.length) {
  console.warn(`[validate:root-tree] WARN: ${warnings.length} cleanup finding(s); release not blocked`);
  for (const item of warnings) console.warn(` - ${item.path}: ${item.reason}`);
} else {
  console.log(`[validate:root-tree] PASS: files=${report.root_file_count}; directories=${report.root_directory_count}`);
}
