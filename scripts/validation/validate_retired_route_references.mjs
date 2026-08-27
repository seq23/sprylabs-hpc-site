#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fail, pass, writeSummary } from './common.mjs';

const ROOT = process.cwd();
const config = JSON.parse(fs.readFileSync('data/content/manual_redirects.json', 'utf8'));
const redirects = config.redirects || [];
const errors = [];
const skipDirs = new Set(['.git', '.pages-output', 'node_modules', 'artifacts', 'coverage', 'reports', '.build', 'test-results', 'playwright-report']);
const allowedFiles = new Set(['data/content/manual_redirects.json', '_redirects', 'docs/REDIRECT_MIGRATION_HISTORY.md', 'scripts/validation/validate_manual_expansion.py']);
const scanExtensions = new Set(['.html', '.xml', '.txt', '.json', '.md', '.js', '.mjs', '.cjs']);

function routeFromSource(sourcePath) {
  const value = '/' + sourcePath.replace(/^\/+/, '');
  return value.endsWith('/index.html') ? value.slice(0, -'index.html'.length) : value;
}
function variants(sourcePath) {
  const route = routeFromSource(sourcePath);
  const out = new Set([route, '/' + sourcePath.replace(/^\/+/, ''), sourcePath.replace(/^\/+/, ''), route.replace(/^\//, '')]);
  if (route.endsWith('/')) out.add(route.slice(0, -1));
  for (const domain of ['spryexecutiveos.com', 'billionairehighperformancecoach.com']) {
    for (const value of [...out]) out.add(`https://${domain}${value}`);
  }
  return [...out];
}

const routeMap = new Map();
for (const entry of redirects) {
  const source = routeFromSource(entry.source_path);
  if (routeMap.has(source)) errors.push(`duplicate redirect source ${source}`);
  routeMap.set(source, entry.target);
  const targetFile = entry.target.endsWith('/') ? `${entry.target.slice(1)}index.html` : entry.target.slice(1);
  if (!fs.existsSync(targetFile) && !fs.existsSync(`${targetFile}.html`)) errors.push(`${source}: redirect target missing ${entry.target}`);
}
for (const [source, target] of routeMap) {
  if (routeMap.has(target)) errors.push(`redirect chain forbidden: ${source} -> ${target} -> ${routeMap.get(target)}`);
  if (source === target) errors.push(`redirect loop: ${source}`);
}

const redirectText = fs.existsSync('_redirects') ? fs.readFileSync('_redirects', 'utf8') : '';
for (const entry of redirects) {
  const source = routeFromSource(entry.source_path);
  if (!redirectText.split(/\r?\n/).some(line => line.trim() === `${source} ${entry.target} 301`)) {
    errors.push(`_redirects missing exact mapping: ${source} ${entry.target} 301`);
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name) || (dir === ROOT && /^(?:CHANGE_MAP_SUMMARY|FINAL_NORMALIZATION_SUMMARY|PHASE\d+_.*)\.txt$/.test(entry.name))) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (entry.isDirectory()) { walk(full); }
    else if (entry.isFile() && scanExtensions.has(path.extname(entry.name)) && !allowedFiles.has(rel) && !rel.startsWith('fixtures/validation/redirects/') && !rel.startsWith('docs/operations/daily-insights/touched-files-')) {
      const text = fs.readFileSync(full, 'utf8');
      if (rel.endsWith('.html')) {
        for (const match of text.matchAll(/href=["']([^"']+)["']/gi)) {
          const href = match[1].split(/[?#]/)[0];
          if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/') || href.startsWith('#')) continue;
          const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), href));
          for (const redirect of redirects) if (resolved === redirect.source_path) errors.push(`${rel}: retired relative href ${match[1]}`);
        }
      }
      for (const redirect of redirects) {
        for (const value of variants(redirect.source_path)) {
          if (text.includes(value)) errors.push(`${rel}: retired route reference ${value}`);
        }
      }
    }
  }
}
walk(ROOT);

writeSummary('validate-retired-route-references', { status: errors.length ? 'FAIL' : 'PASS', redirect_count: redirects.length, errors });
if (errors.length) fail(`[validate:retired-route-references] FAIL: ${errors.length} issue(s)`, errors.slice(0, 200));
pass(`[validate:retired-route-references] OK: ${redirects.length} retired routes are single-hop redirects with no active references`);
