#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONFIG = path.join(ROOT, 'data/content/manual_redirects.json');
const payload = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const redirects = payload.redirects || [];
const domains = ['spryexecutiveos.com', 'billionairehighperformancecoach.com'];
const excluded = new Set([
  'data/content/manual_redirects.json',
  '_redirects',
  'docs/REDIRECT_MIGRATION_HISTORY.md',
]);
const textExtensions = new Set(['.html', '.xml', '.txt', '.json', '.md', '.js', '.mjs', '.cjs']);
const skipDirs = new Set(['.git', 'node_modules', 'artifacts', 'coverage', 'reports', '.build', 'test-results', 'playwright-report']);

function routeFromSource(sourcePath) {
  const normalized = '/' + sourcePath.replace(/^\/+/, '');
  if (normalized.endsWith('/index.html')) return normalized.slice(0, -'index.html'.length);
  return normalized;
}

function variantsFor(sourcePath) {
  const route = routeFromSource(sourcePath);
  const variants = new Set([route, '/' + sourcePath.replace(/^\/+/, ''), sourcePath.replace(/^\/+/, ''), route.replace(/^\//, '')]);
  if (route.endsWith('/')) variants.add(route.slice(0, -1));
  for (const domain of domains) {
    for (const value of [...variants]) {
      variants.add(`https://${domain}${value}`);
    }
  }
  return [...variants].sort((a, b) => b.length - a.length);
}

const mappings = redirects.map((entry) => ({
  source_path: entry.source_path,
  target: entry.target,
  variants: variantsFor(entry.source_path),
}));

for (const mapping of mappings) {
  fs.rmSync(path.join(ROOT, mapping.source_path), {force: true});
}

function targetForVariant(target, original) {
  if (/^https?:\/\//.test(original)) {
    const parsed = new URL(original);
    return `https://${parsed.hostname}${target}`;
  }
  return target;
}

function replaceUrlValue(value, rel) {
  let result = value;
  const suffixMatch = result.match(/([?#].*)$/);
  const suffix = suffixMatch ? suffixMatch[1] : '';
  const bare = suffix ? result.slice(0, -suffix.length) : result;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(bare) && !bare.startsWith('/') && !bare.startsWith('#')) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), bare));
    const relativeMatch = mappings.find((mapping) => mapping.source_path === resolved);
    if (relativeMatch) return relativeMatch.target + suffix;
  }
  for (const mapping of mappings) {
    for (const variant of mapping.variants) {
      if (result === variant || result.startsWith(`${variant}?`) || result.startsWith(`${variant}#`)) {
        const suffix = result.slice(variant.length);
        return targetForVariant(mapping.target, variant) + suffix;
      }
    }
  }
  return result;
}

function rewriteText(rel, text) {
  let replacements = 0;
  let out = text.replace(/\b(href|src|action|content)=(['"])([^'"]+)\2/gi, (match, attr, quote, value) => {
    const next = replaceUrlValue(value, rel);
    if (next !== value) replacements += 1;
    return `${attr}=${quote}${next}${quote}`;
  });

  // Source/template/registry strings may contain literal retired routes outside HTML attributes.
  if (!rel.endsWith('.html')) {
    for (const mapping of mappings) {
      for (const variant of mapping.variants) {
        const literalTarget = targetForVariant(mapping.target, variant);
        if (out.includes(variant)) {
          const before = out;
          out = out.split(variant).join(literalTarget);
          if (out !== before) replacements += 1;
        }
        const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(["'\\x60])${escaped}([?#][^"'\\x60]*)?\\1`, 'g');
        out = out.replace(pattern, (match, quote, suffix = '') => {
          replacements += 1;
          return `${quote}${targetForVariant(mapping.target, variant)}${suffix}${quote}`;
        });
      }
    }
  }
  return { out, replacements };
}

const changed = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && textExtensions.has(path.extname(entry.name)) && !excluded.has(rel)) {
      const before = fs.readFileSync(full, 'utf8');
      const { out, replacements } = rewriteText(rel, before);
      if (replacements && out !== before) {
        fs.writeFileSync(full, out, 'utf8');
        changed.push({ file: rel, replacements });
      }
    }
  }
}
walk(ROOT);

const evidenceDir = path.join(ROOT, 'artifacts/diagnostics/redirect-normalization');
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, 'summary.json'), JSON.stringify({
  status: 'PASS',
  redirect_count: mappings.length,
  changed_files: changed,
  total_replacements: changed.reduce((sum, item) => sum + item.replacements, 0),
}, null, 2) + '\n');
console.log(`[redirects:apply] OK: ${mappings.length} redirects; ${changed.length} files updated; ${changed.reduce((sum, item) => sum + item.replacements, 0)} replacements`);
