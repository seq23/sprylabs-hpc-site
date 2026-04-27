#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const bad = [];
const priorityPath = path.join(root, 'data/index_priority.json');
if (!fs.existsSync(priorityPath)) bad.push('data/index_priority.json missing');
const priority = fs.existsSync(priorityPath) ? JSON.parse(fs.readFileSync(priorityPath, 'utf8')) : { classes: {} };
const sitemap = fs.existsSync(path.join(root, 'sitemap.xml')) ? fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8') : '';
if (!sitemap) bad.push('sitemap.xml missing or empty');
function variants(url) {
  const clean = String(url || '').trim();
  if (!clean || clean.startsWith('http')) return [];
  const noSlash = clean.replace(/^\//, '');
  const out = [clean];
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
