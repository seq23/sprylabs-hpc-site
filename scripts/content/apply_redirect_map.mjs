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
  // A derived index keyed by SOURCE FILE, not by route. Its `source_file` values
  // are repo-relative paths like answers/demand/x.html, and this rewriter turned
  // one into the retired route's target - "/answers/phase4/demand/x" - which is
  // not a path in the tree. scripts/self_test_sitemap_lastmod.mjs then ran
  // `git log -- /answers/phase4/demand/x` and died on "Invalid path '/answers'",
  // failing validate:search-measurement-truthfulness with no bad date behind it.
  // The ledger is regenerated from the sitemap by scripts/sitemap_content_lastmod.mjs
  // on every build, so a retired URL leaves it that way rather than by textual
  // substitution; rewriting it here can only corrupt the field.
  'data/sitemap/lastmod_ledger.json',
]);
const textExtensions = new Set(['.html', '.xml', '.txt', '.json', '.md', '.js', '.mjs', '.cjs']);
const skipDirs = new Set(['.git', '.pages-output', 'node_modules', 'artifacts', 'coverage', 'reports', '.build', 'test-results', 'playwright-report']);

function routeFromSource(sourcePath) {
  const normalized = '/' + sourcePath.replace(/^\/+/, '');
  if (normalized.endsWith('/index.html')) return normalized.slice(0, -'index.html'.length);
  return normalized;
}

function variantsFor(sourcePath) {
  const route = routeFromSource(sourcePath);
  const variants = new Set([route, '/' + sourcePath.replace(/^\/+/, ''), sourcePath.replace(/^\/+/, ''), route.replace(/^\//, '')]);
  if (route.endsWith('/')) variants.add(route.slice(0, -1));
  // A retired page can also be referenced by its canonical (extensionless)
  // route. Without this the redirect map stopped matching the day the route
  // contract dropped .html, and generators quietly relinked to a dead URL.
  for (const value of [...variants]) {
    if (value.endsWith('.html')) variants.add(value.slice(0, -'.html'.length));
  }
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

// A file that does not name any retired route cannot produce a replacement, so
// it does not need the per-variant loops below.
//
// Those loops are O(mappings x variants x corpus): every mapping contributes
// about 16 variants, and each variant costs an includes() scan plus a compiled
// RegExp for every text file in the tree. At the three redirects this script
// was written for that is invisible. Retiring the 743 fallback gap-fill routes
// takes it to roughly 11,900 variant passes over 156 MB across 10,852 files,
// twice per build - measured at about 16s for a single 5.5 MB registry, so tens
// of minutes added to every build from then on, permanently.
//
// Every textual form of a route - absolute, relative, extensionless, or
// domain-qualified - still contains the route's own last path segment. Testing
// one combined alternation of those segments per file skips the files that
// cannot match. Files that can match take exactly the path they took before, so
// the output is unchanged; only the ones with nothing to find are skipped.
//
// If any mapping yields an empty segment the guard disables itself rather than
// risk skipping a file it cannot reason about.
function routeSegment(sourcePath) {
  const clean = sourcePath.replace(/^\/+/, '').replace(/\/index\.html$/, '').replace(/\.html$/, '');
  const parts = clean.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}
const segments = mappings.map((mapping) => routeSegment(mapping.source_path));
const canPrefilter = segments.every((segment) => segment.length > 0);
const prefilter = canPrefilter
  ? new RegExp([...new Set(segments)].map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'))
  : null;
let filesSkippedByPrefilter = 0;

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
    // A relative link can name the clean route as well as the file, so resolve
    // both shapes back to the retired source path.
    const candidates = [resolved, `${resolved}.html`, path.posix.join(resolved.replace(/\/$/, ''), 'index.html')];
    const relativeMatch = mappings.find((mapping) => candidates.includes(mapping.source_path));
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
      if (prefilter && !prefilter.test(before)) { filesSkippedByPrefilter += 1; continue; }
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
  files_skipped_by_prefilter: filesSkippedByPrefilter,
  prefilter_active: Boolean(prefilter),
  changed_files: changed,
  total_replacements: changed.reduce((sum, item) => sum + item.replacements, 0),
}, null, 2) + '\n');
console.log(`[redirects:apply] OK: ${mappings.length} redirects; ${changed.length} files updated; ${changed.reduce((sum, item) => sum + item.replacements, 0)} replacements; ${filesSkippedByPrefilter} files skipped by prefilter`);
