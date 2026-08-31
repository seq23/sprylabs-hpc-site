#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
// '.claude' holds agent worktrees: `git worktree add .claude/worktrees/<id>` puts a
// COMPLETE second checkout of this repo inside the working tree. This walker
// writes, so descending into one corrupts a checkout that is not ours - already
// measured once at 2,295 rewritten files plus a worktree path written into
// TRACKED data. .gitignore governs git, not directory walkers.
const skipDirs = new Set(['.git', '.claude', '.pages-output', 'node_modules', 'artifacts', 'coverage', 'reports', '.build', 'test-results', 'playwright-report']);

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

const mappings = redirects.map((entry, order) => ({
  // Original position, because several lookups below must resolve ties the way
  // a linear scan over `mappings` did: earliest MAPPING wins, not earliest
  // candidate.
  order,
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

// ---------------------------------------------------------------------------
// Indexes. Same answers as the linear scans they replace, in O(1) instead of
// O(mappings x variants) per URL attribute and per file.
//
// Measured on the real tree before this change: 167.3s for ONE call, and
// build:all calls it twice, three times per CI run (once directly, twice inside
// validate:clean-rebuild-parity, which builds twice and diffs). That was about
// 20 of the 28 minutes of every CI run - the cost of the feedback loop, not of
// any work: the same run reports "0 files updated; 0 replacements".
//
// Nothing here may change a byte of output. clean-rebuild-parity diffs two full
// builds, so any behavioural drift surfaces immediately as a parity failure.
// ---------------------------------------------------------------------------

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The attribute path matched `result === variant`, `result.startsWith(variant + '?')`
// or `result.startsWith(variant + '#')`. Because no variant contains '?' or '#'
// (they are derived from repo-relative file paths and optionally domain-prefixed),
// the only substring of `result` that can equal a variant is `result` itself or
// `result` cut at its FIRST '?' or '#'. That makes the scan an exact-key lookup.
//
// The premise is CHECKED, not assumed: if any variant ever does contain '?' or
// '#', the fast path disables itself and the original linear scan runs, because
// then a variant could match at a later separator and a single lookup would be
// wrong.
const variantsAreSeparatorFree = mappings.every((mapping) =>
  mapping.variants.every((variant) => !variant.includes('?') && !variant.includes('#')));

// First mapping wins, matching the linear scan's iteration order. Within a
// mapping, variantsFor() already returns longest-first, and that order is
// preserved here.
const variantIndex = new Map();
for (const mapping of mappings) {
  for (const variant of mapping.variants) {
    if (!variantIndex.has(variant)) variantIndex.set(variant, mapping);
  }
}

// `mappings.find((m) => candidates.includes(m.source_path))` returned the
// earliest MAPPING whose source_path was among the (up to three) candidates -
// not the mapping for the earliest candidate. Keeping `order` and taking the
// minimum reproduces that exactly even if two candidates both resolve.
const sourcePathIndex = new Map();
for (const mapping of mappings) {
  if (!sourcePathIndex.has(mapping.source_path)) sourcePathIndex.set(mapping.source_path, mapping);
}

// The non-HTML branch compiled one RegExp per variant per file - roughly 12,000
// compilations for every file it looked at. They are constant, so they are built
// once here. The `g` flag is safe to reuse because String#replace resets
// lastIndex.
for (const mapping of mappings) {
  mapping.segment = routeSegment(mapping.source_path);
  mapping.variantRecords = mapping.variants.map((variant) => ({
    variant,
    literalTarget: targetForVariant(mapping.target, variant),
    pattern: new RegExp(`(["'\\x60])${escapeRe(variant)}([?#][^"'\\x60]*)?\\1`, 'g'),
  }));
}

// Which mappings can possibly touch a given file. Every textual form of a route
// contains that route's last path segment, so a file naming none of a mapping's
// segment cannot contain any of its variants. One global pass collects the
// segments actually present instead of running ~12,000 substring scans over the
// whole file. This is the same premise the existing per-file prefilter already
// relies on, applied per mapping rather than per file.
const segmentToMappings = new Map();
if (canPrefilter) {
  for (const mapping of mappings) {
    if (!segmentToMappings.has(mapping.segment)) segmentToMappings.set(mapping.segment, []);
    segmentToMappings.get(mapping.segment).push(mapping);
  }
}
const prefilterGlobal = canPrefilter
  ? new RegExp([...new Set(mappings.map((m) => m.segment))].map(escapeRe).join('|'), 'g')
  : null;

function mappingsForText(text) {
  if (!prefilterGlobal) return mappings;
  const present = new Set();
  prefilterGlobal.lastIndex = 0;
  let match;
  while ((match = prefilterGlobal.exec(text)) !== null) present.add(match[0]);
  if (!present.size) return [];
  // Rebuilt in original mapping order, so the rewrite sequence is unchanged.
  const out = [];
  for (const mapping of mappings) if (present.has(mapping.segment)) out.push(mapping);
  return out;
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
    let relativeMatch = null;
    for (const candidate of candidates) {
      const found = sourcePathIndex.get(candidate);
      if (found && (!relativeMatch || found.order < relativeMatch.order)) relativeMatch = found;
    }
    if (relativeMatch) return relativeMatch.target + suffix;
  }
  if (variantsAreSeparatorFree) {
    const cut = result.search(/[?#]/);
    const bare = cut === -1 ? result : result.slice(0, cut);
    const mapping = variantIndex.get(bare);
    if (mapping) return targetForVariant(mapping.target, bare) + (cut === -1 ? '' : result.slice(cut));
    return result;
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
    // Only the mappings whose segment actually occurs; the rest cannot contain a
    // matching variant, so skipping them cannot change the output. Order is the
    // original mapping order.
    for (const mapping of mappingsForText(out)) {
      for (const record of mapping.variantRecords) {
        const { variant, literalTarget, pattern } = record;
        if (out.includes(variant)) {
          const before = out;
          out = out.split(variant).join(literalTarget);
          if (out !== before) replacements += 1;
        }
        // The pattern embeds the variant literally, so it cannot match unless the
        // variant is still present. Guarding the replace is equivalent and skips
        // a full scan of the file per variant.
        if (out.includes(variant)) {
          out = out.replace(pattern, (match, quote, suffix = '') => {
            replacements += 1;
            return `${quote}${literalTarget}${suffix}${quote}`;
          });
        }
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
// Everything above is pure: it reads the redirect map and builds indexes, but
// touches nothing on disk. The destructive work - deleting retired sources,
// rewriting the tree - lives in main(), which runs ONLY when this file is
// executed directly. That is what lets
// scripts/validators/validate_redirect_map_equivalence.mjs import the real
// replaceUrlValue and rewriteText and check them against a naive linear scan,
// instead of a copy that could drift from the code that actually ships.
function main() {
  for (const mapping of mappings) {
    fs.rmSync(path.join(ROOT, mapping.source_path), {force: true});
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
}

export { mappings, replaceUrlValue, rewriteText, targetForVariant, variantsAreSeparatorFree };

// Both sides are resolved through realpath before comparing. path.resolve alone
// compares the path as invoked against the module's real path, so ANY symlink on
// the way in - /tmp -> /private/tmp on macOS, a symlinked checkout, a copied
// worktree reached through a link - makes them differ, main() never runs, and
// `npm run redirects:apply` exits 0 having silently done nothing and printed
// nothing. That is the "runs but inert" failure mode, and it would be invisible:
// the build would simply stop applying redirects.
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (invokedDirectly) main();
