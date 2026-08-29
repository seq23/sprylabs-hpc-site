#!/usr/bin/env node
'use strict';
// Every indexable page must answer above the fold, in one of the two admitted
// patterns: the legacy pre-H1 marker, or a citation definition immediately after
// the H1.
//
// The scan used to be a NON-recursive readdir of three directories
// ('insights','comparisons','whitepapers') plus root synthesis-*.html - 232 of
// 2,265 HTML files, roughly 10% - and then printed "OK (N checked pages)", which
// reads as the site. Widened to the real indexable surface: 2,256 pages, of which
// exactly two do not carry an answer pattern and are exempted by name below.
const fs = require('fs');
const path = require('path');
const { ROOT, listIndexablePages, assertExamined } = require('../lib/site_pages');

// Named exemptions, not a glob. Each says why the page is not an answer surface.
const EXEMPT = new Map([
  ['download.html', 'the product/manual page, frozen byte-identical by release contract; it converts rather than answers'],
  ['knowledge-map/index.html', 'a generated site index whose body is the map itself, not a prose answer'],
]);

const bad = [];
let checked = 0;
for (const rel of listIndexablePages()) {
  if (EXEMPT.has(rel)) continue;
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const main = html.search(/<main\b/i);
  const marker = html.indexOf('data-content-contract="above-fold-answer"');
  const h1 = html.search(/<h1\b/i);
  const legacyValid = marker !== -1 && (main === -1 || marker >= main) && (h1 === -1 || marker < h1);
  const citationOpeningValid = /<h1\b[^>]*>[\s\S]*?<\/h1>\s*<p\b[^>]*class=["'][^"']*\bcitation-definition\b[^"']*["'][^>]*>\s*<strong\b[^>]*>[\s\S]*?<\/strong>\s*<\/p>/i.test(html);
  if (!legacyValid && !citationOpeningValid) bad.push(rel);
  checked++;
}
assertExamined('validate_above_fold', checked);
if (bad.length) {
  console.error(`[validate_above_fold] FAIL: ${bad.length} pages missing an admitted above-fold answer pattern`);
  console.error(bad.slice(0, 25).join('\n'));
  process.exit(1);
}
console.log(`[validate_above_fold] OK (${checked} indexable pages; legacy pre-H1 marker or citation definition after H1; ${EXEMPT.size} exempt by name)`);
process.exit(0);
