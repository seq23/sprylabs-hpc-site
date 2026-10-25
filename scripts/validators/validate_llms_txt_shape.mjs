#!/usr/bin/env node
/**
 * validate:llms-txt-shape
 *
 * llms.txt is the plain-text orientation file an AI engine reads first: what
 * the site is, what it offers, where its key pages are and how to cite it. It
 * is not the index - llms-full.txt is.
 *
 * Search Readiness checklist item a7, 25 Oct 2026: /llms.txt was 21,589 words,
 * every registered page listed three times over. The producer
 * (scripts/citation/apply_citation_program.py update_discovery) now writes the
 * short form and refuses to write one over the cap; this is the check on the
 * committed file, so a hand edit or another writer cannot put the index back.
 *
 * What it requires:
 *   - under WORD_CAP words, non-empty, and still naming both brands
 *   - every section an engine is told to expect
 *   - every priority URL (data/index_priority.json money/comparison/authority/
 *     support) reachable from it - the key pages the checklist asks for
 *   - a pointer to llms-full.txt and to the sitemap index
 *
 * Hard-fails on zero priority routes checked (Rule 0: a pass over an empty list
 * proves nothing).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WORD_CAP = 2000;
const REQUIRED_SECTIONS = ['## What this is not', '## How to cite', '## Start here', '## Full index'];

const rel = 'llms.txt';
const abs = path.join(ROOT, rel);
if (!fs.existsSync(abs)) {
  console.error('[validate:llms-txt-shape] FAIL: llms.txt is missing');
  process.exit(1);
}
const txt = fs.readFileSync(abs, 'utf8');
const words = txt.split(/\s+/).filter(Boolean).length;
const errors = [];

if (!words) errors.push('llms.txt is empty');
if (words > WORD_CAP) {
  errors.push(`llms.txt is ${words} words; the cap is ${WORD_CAP}. The index belongs in llms-full.txt.`);
}
for (const section of REQUIRED_SECTIONS) {
  if (!txt.includes(section)) errors.push(`llms.txt is missing the "${section}" section`);
}
for (const brand of ['Billionaire High Performance Coach', 'Spry Executive OS']) {
  if (!txt.includes(brand)) errors.push(`llms.txt does not name ${brand}`);
}
for (const pointer of ['/llms-full.txt', '/sitemap.xml', '/citation-methodology']) {
  if (!txt.includes(pointer)) errors.push(`llms.txt does not point at ${pointer}`);
}

const priority = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/index_priority.json'), 'utf8')).classes || {};
const routes = [...new Set(['money', 'comparison', 'authority', 'support'].flatMap((k) => priority[k] || []))];
if (!routes.length) {
  console.error('[validate:llms-txt-shape] FAIL: data/index_priority.json lists no money/comparison/authority/support route; checking llms.txt against an empty list proves nothing.');
  process.exit(1);
}
for (const route of routes) {
  if (!txt.includes(route)) errors.push(`llms.txt does not list the priority page ${route}`);
}

const report = { status: errors.length ? 'FAIL' : 'PASS', words, word_cap: WORD_CAP, priority_routes: routes.length, errors };
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/llms-txt-shape.json'), JSON.stringify(report, null, 2) + '\n');
if (errors.length) {
  console.error('[validate:llms-txt-shape] FAIL');
  errors.forEach((e) => console.error(` - ${e}`));
  process.exit(1);
}
console.log(`[validate:llms-txt-shape] OK: ${words} words (cap ${WORD_CAP}); ${routes.length} priority routes listed`);
