/*
  Audit Warnings (no hard-fail)
  Usage: node scripts/audit_warnings.js
  Prints:
   - pages missing reinforcement (gumroad link)
   - pages missing search variants section
   - duplicate reinforcement blocks
   - placeholder/stub patterns
   - internal broken links (best-effort)
*/

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function toUrlPath(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (!rel.endsWith('.html')) return null;
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'/index.html'.length) + '/';
  return '/' + rel;
}

const files = walk(ROOT).filter(f => f.endsWith('.html'));
const existing = new Set(files.map(toUrlPath).filter(Boolean));
// Also accept explicit index.html paths (Cloudflare serves them)
for (const u of Array.from(existing)) {
  if (u.endsWith('/')) existing.add(u + 'index.html');
}

const WARN = {
  missingReinforcement: [],
  missingSearchVariants: [],
  duplicateReinforcement: [],
  stubPatterns: [],
  brokenLinks: [],
};

const STUB_RE = /(lorem ipsum|TODO\b|TK\b|placeholder|coming soon)/i;

function normHref(href, fileUrlBase) {
  if (!href) return null;
  if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#') || href.startsWith('//')) return null;
  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return null;
  if (clean.startsWith('/')) return clean;
  // relative
  const joined = path.posix.normalize(path.posix.join(fileUrlBase, clean));
  return joined.startsWith('/') ? joined : '/' + joined;
}

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const url = toUrlPath(file);
  const base = url.endsWith('/') ? url : path.posix.dirname(url) + '/';

  const gumroadMatches = html.match(/sprylabs\.gumroad\.com\/l\/billionaire-high-performance-coach/gi) || [];
  if (gumroadMatches.length === 0 && url !== '/' && !url.startsWith('/answers/') && !url.startsWith('/ai-execution-atlas/')) {
    WARN.missingReinforcement.push(url);
  }
  if (gumroadMatches.length > 2) {
    WARN.duplicateReinforcement.push({ url, count: gumroadMatches.length });
  }

  if (!/If you searched something like/i.test(html) && url.endsWith('/') && !url.startsWith('/answers/') && !url.startsWith('/ai-execution-atlas/')) {
    WARN.missingSearchVariants.push(url);
  }

  if (STUB_RE.test(html)) {
    WARN.stubPatterns.push(url);
  }

  // internal links
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  for (const href of hrefs) {
    const u = normHref(href, base);
    if (!u) continue;
    if (u.endsWith('.css') || u.endsWith('.js') || u.endsWith('.png') || u.endsWith('.ico') || u.endsWith('.xml') || u.endsWith('.txt')) continue;
    if (!existing.has(u) && !existing.has(u.endsWith('/') ? u : u + '/')) {
      // allow common server behavior: /foo -> /foo/
      if (existing.has(u + '/')) continue;
      WARN.brokenLinks.push({ from: url, to: href });
    }
  }
}

function printSection(title, items) {
  console.log('\n' + title);
  console.log('-'.repeat(title.length));
  if (!items.length) {
    console.log('None');
    return;
  }
  for (const it of items) console.log(typeof it === 'string' ? it : JSON.stringify(it));
}

console.log('AUDIT WARNINGS (non-blocking)');
printSection('Missing reinforcement (no Gumroad link)', WARN.missingReinforcement);
printSection('Missing “If you searched…” section', WARN.missingSearchVariants);
printSection('Duplicate reinforcement (more than 2 Gumroad links)', WARN.duplicateReinforcement);
printSection('Stub/placeholder patterns', WARN.stubPatterns);
printSection('Broken internal links (best-effort)', WARN.brokenLinks.slice(0, 200));

if (WARN.brokenLinks.length > 200) {
  console.log(`\n(Only first 200 broken links shown. Total: ${WARN.brokenLinks.length})`);
}
