#!/usr/bin/env node
/**
 * validate:search-snippet-bounds
 *
 * Every indexable page has a <title> of 30-70 characters and a meta description
 * of 110-160 characters, and no two indexable pages share either one. The
 * bounds and the page set come from the same modules the repair uses
 * (scripts/lib/search_snippet_bounds.cjs, scripts/lib/site_pages.js), so the
 * check cannot drift from what it checks.
 *
 * Bing Webmaster Tools, 25 Sep 2026: rule 118 "meta description too short" on 8
 * billionairehighperformancecoach.com pages and 24 spryexecutiveos.com pages
 * (41-98 characters), and Site Scan's "title too long" above 70. The existing
 * validate:page-seo-contract measures title length too, but only as a warning,
 * and between 20 and 70 / 70 and 180 - which is how 1,813 over-long titles and
 * 1,808 over-long descriptions shipped.
 *
 * Reach: every URL in the committed sitemaps must map to a page this scan
 * examined, so a sitemap-listed page cannot sit outside the guard. Exits
 * non-zero if zero pages are examined.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const B = require(path.join(ROOT, 'scripts/lib/search_snippet_bounds.cjs'));
const { listIndexablePages, assertExamined } = require(path.join(ROOT, 'scripts/lib/site_pages.js'));

const pages = listIndexablePages(ROOT);
const scanned = pages.filter((rel) => !B.EXEMPT_PAGES.has(rel));
assertExamined('validate:search-snippet-bounds', scanned.length);

const errors = [];
const titles = new Map();
const descs = new Map();
for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const title = B.titleOf(html);
  const desc = B.descriptionOf(html);
  if (!B.EXEMPT_PAGES.has(rel)) {
    if (!B.inTitleRange(title)) errors.push(`${rel}: title is ${title.length} characters (want ${B.TITLE_MIN}-${B.TITLE_MAX}): "${title}"`);
    if (!B.inDescRange(desc)) errors.push(`${rel}: meta description is ${desc.length} characters (want ${B.DESC_MIN}-${B.DESC_MAX}): "${desc}"`);
  }
  if (title) {
    if (titles.has(title)) errors.push(`${rel}: duplicate title, same as ${titles.get(title)}: "${title}"`);
    else titles.set(title, rel);
  }
  if (desc) {
    if (descs.has(desc)) errors.push(`${rel}: duplicate meta description, same as ${descs.get(desc)}: "${desc}"`);
    else descs.set(desc, rel);
  }
}

// Reach: every URL in the sitemaps the site advertises (sitemap.xml's index,
// which robots.txt points at) is a page examined above (or an exempt one).
const examined = new Set(pages);
const indexXml = fs.existsSync(path.join(ROOT, 'sitemap.xml')) ? fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8') : '';
const sitemapFiles = [...indexXml.matchAll(/<sitemap>\s*<loc>\s*https?:\/\/[^/<]+\/([^<\s]+)\s*<\/loc>/g)].map((m) => m[1])
  .filter((f) => fs.existsSync(path.join(ROOT, f)));
if (!sitemapFiles.length) errors.push('sitemap.xml indexes no sitemap present in the tree, so reach cannot be proved');
let sitemapUrls = 0;
for (const f of sitemapFiles) {
  const xml = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of xml.matchAll(/<loc>\s*https?:\/\/[^/<]+(\/[^<\s]*)?\s*<\/loc>/g)) {
    sitemapUrls += 1;
    const p = (m[1] || '/').replace(/^\//, '');
    const candidates = p === '' || p.endsWith('/') ? [`${p}index.html`] : [`${p}.html`, `${p}/index.html`, p];
    if (!candidates.some((c) => examined.has(c))) errors.push(`${f}: ${m[0].replace(/<\/?loc>/g, '').trim()} is not an indexable page this check examined`);
  }
}
if (!sitemapUrls) errors.push('the sitemaps list zero URLs, so reach cannot be proved');

if (errors.length) {
  console.error(`[validate:search-snippet-bounds] FAIL: ${errors.length} problem(s) across ${scanned.length} indexable pages`);
  for (const e of errors.slice(0, 80)) console.error(`  - ${e}`);
  if (errors.length > 80) console.error(`  ... and ${errors.length - 80} more`);
  process.exit(1);
}
console.log(`[validate:search-snippet-bounds] OK: ${scanned.length} indexable pages have a ${B.TITLE_MIN}-${B.TITLE_MAX} character title and a ${B.DESC_MIN}-${B.DESC_MAX} character meta description, all unique; ${sitemapUrls} sitemap URLs reached (exempt: ${[...B.EXEMPT_PAGES].join(', ')})`);
