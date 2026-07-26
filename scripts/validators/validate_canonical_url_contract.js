#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const bad = [];
const priority = JSON.parse(fs.readFileSync(path.join(root, 'data/index_priority.json'), 'utf8'));
const targets = new Set(['download.html']);
function relFor(url) {
  let rel = String(url || '').replace(/^\//, '');
  if (!rel) return null;
  if (rel === 'download') rel = 'download.html';
  if (rel.endsWith('/')) rel += 'index.html';
  if (!path.extname(rel) && fs.existsSync(path.join(root, rel + '.html'))) rel += '.html';
  return rel;
}
for (const urls of Object.values(priority.classes || {})) {
  if (!Array.isArray(urls)) continue;
  for (const url of urls) {
    const rel = relFor(url);
    if (rel && rel.endsWith('.html')) targets.add(rel);
  }
}
for (const rel of targets) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) continue;
  const html = fs.readFileSync(p, 'utf8');
  if (new RegExp("aplayer" + "mode" + "\\.com" + "\\/download", "i").test(html)) bad.push(`${rel}: forbidden A Player Mode redirect-plus-download`);
  const m = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i) || html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
  if (!m) { bad.push(`${rel}: missing canonical link`); continue; }
  const href = m[1];
  if (/aplayermode\.com/i.test(href)) bad.push(`${rel}: canonical must not use A Player Mode redirect domain`);
  if (!/^https:\/\//i.test(href)) bad.push(`${rel}: canonical must be absolute https URL`);
  if (/([^:]\/)\/+/i.test(href.replace('https://', 'https:--'))) bad.push(`${rel}: canonical contains duplicate slash`);
}
if (bad.length) {
  console.error('[validate_canonical_url_contract] FAIL');
  bad.forEach(x => console.error(' - ' + x));
  process.exit(1);
}
console.log(`[validate_canonical_url_contract] OK (${targets.size} target pages checked)`);
