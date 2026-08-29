#!/usr/bin/env node
'use strict';
// Every indexable page must expose the two structures an extractor needs: a
// single named subject (h1) and at least one prose block (p).
//
// This used to read `fs.readdirSync(process.cwd()).slice(0, 40)` - the first 40
// ROOT files in alphabetical order, no subdirectories - and then print
// "EXTRACTABILITY PASS: sampled N root html pages". 40 of 2,265 files, a sample
// that stopped deterministically at chatgpt-prompts-*, reported as a pass. It
// also passed on an empty list. Measured when this was widened: 2,256 indexable
// pages, 0 failures, so the narrow scan was hiding no debt - it was simply not
// looking.
const fs = require('fs');
const path = require('path');
const { ROOT, listIndexablePages, assertExamined } = require('../lib/site_pages');

const bad = [];
let checked = 0;
for (const rel of listIndexablePages()) {
  if (/(^|\/)admin\.html$/i.test(rel)) continue; // operator console, not a published answer surface
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!/<h1[\s>]/i.test(html)) { bad.push(`${rel}: missing h1`); continue; }
  if (!/<p[\s>]/i.test(html)) { bad.push(`${rel}: missing paragraph answer surface`); continue; }
  checked++;
}
assertExamined('validate_extractability', checked);
if (bad.length) {
  console.error(`[validate_extractability] FAIL: ${bad.length} indexable page(s) missing an extractable structure`);
  for (const b of bad.slice(0, 25)) console.error(`  ${b}`);
  process.exit(1);
}
console.log(`EXTRACTABILITY PASS: ${checked} indexable pages carry an h1 and a paragraph answer surface`);
