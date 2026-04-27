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
  const main = html.search(/<main\b/i);
  const marker = html.indexOf('data-content-contract="above-fold-answer"');
  const h1 = html.search(/<h1\b/i);
  if (marker === -1 || (main !== -1 && marker < main) || (h1 !== -1 && marker > h1)) bad.push(path.relative(ROOT, f));
}
if (bad.length) { console.error(`[validate_above_fold] FAIL: ${bad.length} pages missing above-fold direct answer before H1`); console.error(bad.slice(0,25).join('\n')); process.exit(1); }
console.log(`[validate_above_fold] OK (${files.length} checked pages)`);

process.exit(0);
