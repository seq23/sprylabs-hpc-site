#!/usr/bin/env node
import fs from 'node:fs';

// Invariant (changed 2026-08-26): a page's canonical URL is the form that
// answers 200 without a redirect hop, and that exact string is what its own
// host's sitemap lists. /sitemap.xml is a host-neutral sitemap index, because
// one Pages deployment answers both hosts and a urlset there would serve each
// host a file full of the other host's URLs.
const pages = JSON.parse(fs.readFileSync('data/citation/citable_pages.json', 'utf8')).pages.filter((x) => x.status === 'ACTIVE');
const spry = fs.readFileSync('sitemap-spry.xml', 'utf8');
const bhpc = fs.readFileSync('sitemap-bhpc.xml', 'utf8');
const rootMap = fs.readFileSync('sitemap.xml', 'utf8');
const errors = [];

function locs(xml) {
  return new Set([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim()));
}
const spryLocs = locs(spry);
const bhpcLocs = locs(bhpc);

for (const p of pages) {
  const isSpry = p.canonical_domain.includes('spryexecutiveos');
  const own = isSpry ? spryLocs : bhpcLocs;
  const other = isSpry ? bhpcLocs : spryLocs;
  if (!own.has(p.canonical_url)) errors.push(`sitemap missing ${p.canonical_url}`);
  if (other.has(p.canonical_url)) errors.push(`cross-host sitemap entry ${p.canonical_url}`);
}

// Each host sitemap may only contain URLs for its own host.
for (const [name, set, host] of [['sitemap-spry.xml', spryLocs, 'https://spryexecutiveos.com/'], ['sitemap-bhpc.xml', bhpcLocs, 'https://billionairehighperformancecoach.com/']]) {
  for (const url of set) if (!url.startsWith(host)) errors.push(`${name} lists foreign host URL ${url}`);
}

// /sitemap.xml must be an index naming both child sitemaps, never a urlset.
if (!/<sitemapindex\b/.test(rootMap)) errors.push('sitemap.xml must be a <sitemapindex>, not a <urlset>');
if (/<urlset\b/.test(rootMap)) errors.push('sitemap.xml must not contain a <urlset>');
for (const child of ['https://billionairehighperformancecoach.com/sitemap-bhpc.xml', 'https://spryexecutiveos.com/sitemap-spry.xml']) {
  if (!rootMap.includes(child)) errors.push(`sitemap.xml index missing child ${child}`);
}

fs.mkdirSync('artifacts/diagnostics/container-current/validate-sitemap-coverage', { recursive: true });
fs.writeFileSync('artifacts/diagnostics/container-current/validate-sitemap-coverage/summary.json', JSON.stringify({ status: errors.length ? 'FAIL' : 'PASS', checked: pages.length, errors }, null, 2) + '\n');
if (errors.length) { console.error('[validate:sitemap-coverage] FAIL'); errors.slice(0, 200).forEach((e) => console.error(' - ' + e)); process.exit(1); }
console.log(`[validate:sitemap-coverage] OK: ${pages.length} active pages covered by their own host sitemap; sitemap.xml is a host-neutral index`);
