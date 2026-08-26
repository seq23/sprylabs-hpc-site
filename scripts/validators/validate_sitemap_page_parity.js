#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const bad = [];
const priorityPath = path.join(root, 'data/index_priority.json');
if (!fs.existsSync(priorityPath)) bad.push('data/index_priority.json missing');
const priority = fs.existsSync(priorityPath) ? JSON.parse(fs.readFileSync(priorityPath, 'utf8')) : { classes: {} };
// /sitemap.xml is a host-neutral sitemap index; priority URLs are asserted
// against the two per-host child sitemaps it points at.
const readIf = (f) => (fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : '');
const sitemapIndex = readIf('sitemap.xml');
const sitemap = readIf('sitemap-bhpc.xml') + readIf('sitemap-spry.xml');
if (!sitemap) bad.push('per-host sitemaps missing or empty');
if (!/<sitemapindex\b/.test(sitemapIndex)) bad.push('sitemap.xml must be a host-neutral <sitemapindex>');
function variants(url) {
  const clean = String(url || '').trim();
  if (!clean || clean.startsWith('http')) return [];
  const noSlash = clean.replace(/^\//, '');
  const out = [clean];
  // /download is the one route whose canonical is still the .html form:
  // download.html is the frozen revenue surface and its on-page canonical
  // cannot be rewritten, so the sitemap agrees with the page rather than
  // with the site-wide extensionless contract.
  if (clean === '/download') out.push('/download.html');
  if (clean.endsWith('/')) out.push(`${clean}index.html`);
  if (!path.extname(noSlash) && !clean.endsWith('/')) out.push(`${clean}.html`, `${clean}/`);
  return [...new Set(out)];
}
function fileCandidates(url) {
  return variants(url).map(v => {
    let rel = v.replace(/^\//, '');
    if (rel === 'download') rel = 'download.html';
    if (rel.endsWith('/')) rel += 'index.html';
    return rel;
  });
}
const checked = [];
for (const [klass, urls] of Object.entries(priority.classes || {})) {
  if (!Array.isArray(urls)) continue;
  if (klass === 'archive') continue;
  for (const url of urls) {
    checked.push(`${klass}:${url}`);
    const files = fileCandidates(url);
    if (!files.some(rel => fs.existsSync(path.join(root, rel)))) bad.push(`missing page file for ${klass} URL ${url}`);
    const sitemapVariants = variants(url);
    if (!sitemapVariants.some(v => sitemap.includes(v))) bad.push(`sitemap missing ${klass} URL ${url}`);
  }
}
if (bad.length) {
  console.error('[validate_sitemap_page_parity] FAIL');
  bad.forEach(x => console.error(' - ' + x));
  process.exit(1);
}
console.log(`[validate_sitemap_page_parity] OK (${checked.length} priority URLs checked)`);
