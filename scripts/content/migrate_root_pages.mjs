#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const KEEP_ROOT_HTML = new Set(['index.html', 'admin.html', 'download.html', 'about.html', 'author.html']);
const TEXT_EXTENSIONS = new Set(['.html', '.xml', '.txt', '.json', '.md', '.js', '.mjs', '.cjs']);
const SKIP_DIRS = new Set([
  '.git',
  '.build',
  '.rsync-tmp',
  '.validation-cache',
  '.validation-runtime',
  'artifacts',
  'coverage',
  'node_modules',
  'playwright-report',
  'reports',
  'test-results',
  'validation_cache',
  'validation_runtime'
]);
const EXCLUDED_TEXT_FILES = new Set([
  '_redirects',
  'data/content/manual_redirects.json',
  'data/content/root_page_migration_map.json',
  'docs/REDIRECT_MIGRATION_HISTORY.md'
]);
const DOMAINS = ['spryexecutiveos.com', 'billionairehighperformancecoach.com'];

function rootHtmlFiles() {
  return fs.readdirSync(ROOT, {withFileTypes: true})
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html') && !KEEP_ROOT_HTML.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function targetFor(file) {
  if (file.startsWith('synthesis-')) return `synthesis/${file.replace(/^synthesis-/, '')}`;
  return `guides/${file}`;
}

function routeFor(rel) {
  return `/${rel.replace(/^\/+/, '')}`;
}

function variantsFor(oldRel) {
  const route = routeFor(oldRel);
  const variants = new Set([route]);
  for (const domain of DOMAINS) {
    variants.add(`https://${domain}${route}`);
  }
  return [...variants].sort((a, b) => b.length - a.length);
}

function replacementFor(oldValue, newRel) {
  if (/^https?:\/\//i.test(oldValue)) {
    const url = new URL(oldValue);
    return `https://${url.hostname}${routeFor(newRel)}`;
  }
  if (oldValue.startsWith('/')) return routeFor(newRel);
  return newRel;
}

function replaceVariant(text, variant, replacement) {
  if (/^https?:\/\//i.test(variant)) {
    return text.split(variant).join(replacement);
  }
  const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(^|[^A-Za-z0-9_./-])${escaped}(?=([?#"'\\x60<>)\\]\\s,]|$))`, 'g'), `$1${replacement}`);
}

function replaceAllKnownRoutes(text, migrations) {
  let out = text;
  let replacements = 0;
  for (const migration of migrations) {
    for (const variant of migration.variants) {
      const replacement = replacementFor(variant, migration.target_path);
      const next = replaceVariant(out, variant, replacement);
      if (next !== out) {
        replacements += out.split(variant).length - 1;
        out = next;
      }
    }
  }
  return {out, replacements};
}

function walkTextFiles(dir = ROOT) {
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) out.push(...walkTextFiles(full));
    else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name)) && !EXCLUDED_TEXT_FILES.has(rel)) out.push(rel);
  }
  return out.sort();
}

function readJson(rel, fallback) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(rel, payload) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function updateManualRedirects(migrations) {
  const rel = 'data/content/manual_redirects.json';
  const payload = readJson(rel, {schema_version: '1.0', generated_at: new Date().toISOString().slice(0, 10), redirects: []});
  const bySource = new Map((payload.redirects || []).map((entry) => [entry.source_path, entry]));
  for (const migration of migrations) {
    bySource.set(migration.source_path, {
      source_path: migration.source_path,
      target: routeFor(migration.target_path),
      domain: migration.domain,
      reason: 'root_page_migration'
    });
  }
  payload.generated_at = new Date().toISOString().slice(0, 10);
  payload.redirect_count = bySource.size;
  payload.redirects = [...bySource.values()].sort((left, right) => left.source_path.localeCompare(right.source_path));
  writeJson(rel, payload);
}

function updateRedirectsFile(migrations) {
  const redirectsPath = path.join(ROOT, '_redirects');
  const existing = fs.existsSync(redirectsPath)
    ? fs.readFileSync(redirectsPath, 'utf8').split(/\r?\n/).filter(Boolean)
    : [];
  const lines = new Set(existing);
  for (const migration of migrations) lines.add(`${routeFor(migration.source_path)} ${routeFor(migration.target_path)} 301`);
  fs.writeFileSync(redirectsPath, `${[...lines].join('\n')}\n`, 'utf8');
}

const files = rootHtmlFiles();
const migrations = files.map((file) => {
  const target = targetFor(file);
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const domain = /spryexecutiveos\.com/i.test(html) && !/billionairehighperformancecoach\.com/i.test(html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0] || '')
    ? 'spryexecutiveos.com'
    : 'billionairehighperformancecoach.com';
  return {
    source_path: file,
    target_path: target,
    old_route: routeFor(file),
    new_route: routeFor(target),
    domain,
    variants: variantsFor(file)
  };
});

for (const migration of migrations) {
  const source = path.join(ROOT, migration.source_path);
  const target = path.join(ROOT, migration.target_path);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  const {out} = replaceAllKnownRoutes(fs.readFileSync(source, 'utf8'), [migration]);
  fs.writeFileSync(target, out, 'utf8');
  fs.rmSync(source, {force: true});
}

if (migrations.length) {
  updateManualRedirects(migrations);
  updateRedirectsFile(migrations);
  const changedFiles = [];
  for (const rel of walkTextFiles()) {
    const file = path.join(ROOT, rel);
    const before = fs.readFileSync(file, 'utf8');
    const {out, replacements} = replaceAllKnownRoutes(before, migrations);
    if (replacements && out !== before) {
      fs.writeFileSync(file, out, 'utf8');
      changedFiles.push({file: rel, replacements});
    }
  }
  writeJson('data/content/root_page_migration_map.json', {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    keep_root_html: [...KEEP_ROOT_HTML].sort(),
    migrated_count: migrations.length,
    changed_file_count: changedFiles.length,
    migrations: migrations.map(({variants, ...migration}) => migration),
    changed_files: changedFiles
  });
}

console.log(`[root-page-migration] PASS: migrated=${migrations.length} kept_root=${[...KEEP_ROOT_HTML].sort().join(',')}`);
