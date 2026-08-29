#!/usr/bin/env node
'use strict';
// Every indexable page must carry a route to the product.
//
// Two things were wrong here. The scan was a NON-recursive readdir of three
// directories plus root synthesis-*.html - 232 of 2,265 HTML files - and the
// only admitted CTA shapes were the aplayermode.com URL and the cta-block
// marker, both of which belong to the Spry side of this two-host property.
// Widening the scan alone would have failed 1,409 pages that DO carry a CTA:
// measured, every one of those 1,409 links /download.html or the Gumroad
// product, and ZERO of them have no route to the product at all. So the fix is
// to widen the surface AND admit the CTA shapes the BHPC host actually renders -
// not to relax the requirement.
const fs = require('fs');
const path = require('path');
const { ROOT, listIndexablePages, assertExamined } = require('../lib/site_pages');

// Each entry is a real, admitted route to the product.
const ADMITTED_CTA = [
  ['aplayermode', (h) => h.includes('https://aplayermode.com')],
  ['cta-block', (h) => h.includes('data-content-contract="cta-block"')],
  ['download-manual', (h) => /href=["']\/download\.html["']/.test(h)],
  ['gumroad', (h) => /gumroad\.com/.test(h)],
];

const bad = [];
const byShape = new Map(ADMITTED_CTA.map(([n]) => [n, 0]));
let checked = 0;
for (const rel of listIndexablePages()) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const hit = ADMITTED_CTA.find(([, test]) => test(html));
  if (!hit) bad.push(rel);
  else byShape.set(hit[0], byShape.get(hit[0]) + 1);
  checked++;
}
assertExamined('validate_cta_presence', checked);
if (bad.length) {
  console.error(`[validate_cta_presence] FAIL: ${bad.length} indexable pages carry no admitted route to the product`);
  console.error(bad.slice(0, 25).join('\n'));
  process.exit(1);
}
const shapes = [...byShape].map(([n, c]) => `${n}=${c}`).join(', ');
console.log(`[validate_cta_presence] OK (${checked} indexable pages; first admitted CTA shape per page: ${shapes})`);
process.exit(0);
