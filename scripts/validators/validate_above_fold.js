#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const TARGET_DIRS = ['insights','comparisons','whitepapers'];
const files = [];
for (const dir of TARGET_DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) if (f.endsWith('.html')) files.push(path.join(abs, f));
}
for (const f of fs.readdirSync(ROOT)) if (/^synthesis-.*\.html$/.test(f)) files.push(path.join(ROOT, f));
const bad = [];
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  if (/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html) || /<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots["']/i.test(html)) continue;
  const main = html.search(/<main\b/i);
  const marker = html.indexOf('data-content-contract="above-fold-answer"');
  const h1 = html.search(/<h1\b/i);
  const legacyValid = marker !== -1 && (main === -1 || marker >= main) && (h1 === -1 || marker < h1);
  const citationOpeningValid = /<h1\b[^>]*>[\s\S]*?<\/h1>\s*<p\b[^>]*class=["'][^"']*\bcitation-definition\b[^"']*["'][^>]*>\s*<strong\b[^>]*>[\s\S]*?<\/strong>\s*<\/p>/i.test(html);
  if (!legacyValid && !citationOpeningValid) bad.push(path.relative(ROOT, f));
}
if (bad.length) {
  console.error(`[validate_above_fold] FAIL: ${bad.length} pages missing an admitted above-fold answer pattern`);
  console.error(bad.slice(0,25).join('\n'));
  process.exit(1);
}
console.log(`[validate_above_fold] OK (${files.length} checked pages; legacy pre-H1 or citation definition after H1)`);
process.exit(0);
