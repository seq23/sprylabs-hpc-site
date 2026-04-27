#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const CTA = 'https://aplayermode.com';
const TARGET_DIRS = ['insights','comparisons','whitepapers'];
const TARGET_FILES = [];
for (const dir of TARGET_DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) if (f.endsWith('.html')) TARGET_FILES.push(path.join(abs, f));
}
for (const f of fs.readdirSync(ROOT)) if (/^synthesis-.*\.html$/.test(f)) TARGET_FILES.push(path.join(ROOT, f));
const bad = [];
for (const f of TARGET_FILES) {
  const html = fs.readFileSync(f, 'utf8');
  if (!html.includes(CTA) && !html.includes('data-content-contract="cta-block"')) bad.push(path.relative(ROOT, f));
}
if (bad.length) { console.error(`[validate_cta_presence] FAIL: ${bad.length} pages missing CTA`); console.error(bad.slice(0,25).join('\n')); process.exit(1); }
console.log(`[validate_cta_presence] OK (${TARGET_FILES.length} checked pages)`);

process.exit(0);
