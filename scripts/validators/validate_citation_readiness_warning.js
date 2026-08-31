#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const { routeFor } = require('../lib/dual_domain_policy.cjs');
const dataPath = path.join(root, 'data/citation_opportunities/bhpc_priority_queries.json');
const warnings = [];
// The priority queries file is the entire subject of this check. Missing it used
// to print "skipped" and exit 0 - and that branch read `warnings` before it was
// declared, so it threw a ReferenceError instead. Both the absent file and an
// empty items array leave every loop below running zero times, which reports
// citation readiness without having examined a single page.
if (!fs.existsSync(dataPath)) {
  console.error('[citation:warn] FAIL: data/citation_opportunities/bhpc_priority_queries.json not found; expected the priority query rows this check reads. Skipping the file and exiting 0 proves no page is citation-ready.');
  process.exit(1);
}
const items = JSON.parse(fs.readFileSync(dataPath, 'utf8')).items || [];
if (!items.length) {
  console.error('[citation:warn] FAIL: data/citation_opportunities/bhpc_priority_queries.json lists no items; expected at least one priority citation row. Reporting OK over zero rows proves nothing.');
  process.exit(1);
}
function read(rel) {
  const file = path.join(root, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}
function includesLoose(haystack, needle) {
  return haystack.toLowerCase().includes(String(needle || '').toLowerCase());
}
for (const item of items) {
  const page = read(item.target_file);
  const answer = read(item.answer_page);
  if (!page) {
    warnings.push(`${item.query}: target page missing (${item.target_file})`);
    continue;
  }
  if (!answer) warnings.push(`${item.query}: answer page missing (${item.answer_page})`);
  if (!page.includes('data-llm-answer="true"')) warnings.push(`${item.target_file}: missing data-llm-answer direct answer block`);
  if (!page.includes('data-citation-opportunity="bhpc-priority"')) warnings.push(`${item.target_file}: missing bhpc priority citation pathway block`);
  if (!includesLoose(page, item.query.split(/\s+/).slice(0, 3).join(' '))) warnings.push(`${item.target_file}: weak query phrase coverage for "${item.query}"`);
  const internalLinks = (page.match(/href="\//g) || []).length;
  if (internalLinks < 3) warnings.push(`${item.target_file}: fewer than 3 internal links found`);
  if (!page.includes('BHPC_CITATION_SCHEMA')) warnings.push(`${item.target_file}: missing BHPC citation schema`);
  if (!answer.includes('data-llm-answer="true"')) warnings.push(`${item.answer_page}: missing answer-page direct answer block`);
}
const answerIndex = read('answers.json');
for (const item of items) {
  // answers.json holds canonical URLs, which are the 200-serving form and no
  // longer carry .html; answer_page is a repo-relative file path. Compare via
  // the route contract rather than assuming the two strings match.
  const route = routeFor(item.answer_page);
  if (!answerIndex.includes(route)) warnings.push(`answers.json missing ${item.answer_page} (route ${route})`);
}
const llms = read('llms.txt');
for (const item of items) {
  if (!llms.includes(item.query)) warnings.push(`llms.txt missing query entry: ${item.query}`);
}
if (warnings.length) {
  console.log(`[citation:warn] WARN: ${warnings.length} citation-readiness warning(s)`);
  for (const warning of warnings.slice(0, 120)) console.log(` - ${warning}`);
} else {
  console.log(`[citation:warn] OK: ${items.length} priority citation rows have direct answers, answer pages, schema markers, and llms.txt entries`);
}
process.exit(warnings.length ? 1 : 0);
