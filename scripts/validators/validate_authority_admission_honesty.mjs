#!/usr/bin/env node
// A page may not manufacture its own justification.
//
// scripts/build_authority_papers.js used to admit every released whitepaper with
// two fabricated fields:
//
//   admission_level: 'baseline'   - hardcoded, on pages created that morning
//   primary_query: <the title>    - when no registered query existed
//
// `baseline` is the level meaning "predates the demand gate, never substantively
// checked", and validate_programmatic_admission.py skips every quality check for
// it. Claiming it for a new page is a false statement about that page's history
// that also switches off its inspection. The primary_query fallback then took
// the paper's own title as its query, and data/citation/query_registry.json
// mirrored that string back as though it had been observed - so the evidence for
// the page was the page.
//
// validate_demand_backed_pages.mjs caught the consequence and the release went
// red every day. This validator catches the cause, in the registry, so the next
// writer that reaches for a fallback fails here instead.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const errors = [];

const registry = read('data/content/page_admission_registry.json');
const records = registry.records || registry.pages || [];
if (!records.length) {
  console.error('[authority-admission-honesty] FAIL: the admission registry carries no records; every check here loops over that list, so an empty one would report PASS having examined nothing.');
  process.exit(1);
}

const baselineDoc = read('data/demand/pre_gate_page_baseline.json');
const sealed = new Set(Array.isArray(baselineDoc.routes) ? baselineDoc.routes : []);
if (!sealed.size) {
  console.error('[authority-admission-honesty] FAIL: the sealed pre-gate baseline lists no routes. Without it every page reads as pre-gate and `baseline` becomes legal everywhere, which is exactly the claim this validator exists to test.');
  process.exit(1);
}

const queries = read('data/citation/query_registry.json').queries || [];
const activeQueryByPage = new Map(
  queries.filter((q) => q && q.release_status === 'ACTIVE' && q.primary_page).map((q) => [q.primary_page, q])
);

let examined = 0;
let authorityExamined = 0;
for (const rec of records) {
  const route = rec.route || (rec.path ? `/${rec.path}` : null);
  if (!route) continue;
  examined += 1;
  const isPreGate = sealed.has(route);

  // 1. `baseline` is a historical fact, not a convenience. Only the sealed set
  //    predates the gate; anything else claiming it is skipping its own checks.
  if (rec.admission_level === 'baseline' && !isPreGate) {
    errors.push(
      `${route}: admitted at "baseline" but is not in the sealed pre-gate baseline. "baseline" means the page predates the demand gate and is exempt from every substantive check in validate_programmatic_admission.py. A page created after the gate must be admitted at "full".`
    );
  }

  if (rec.generation_lane !== 'authority') continue;
  authorityExamined += 1;

  // 2. An authority page's primary_query must be a registered, ACTIVE query for
  //    that page - not a string derived from the page's own title.
  const q = activeQueryByPage.get(rec.path);
  if (!isPreGate) {
    if (!q) {
      errors.push(`${route}: authority-lane page admitted with primary_query "${rec.primary_query}" but data/citation/query_registry.json has no ACTIVE entry whose primary_page is this file. The query cannot be shown to come from anywhere but the page itself.`);
    } else if (String(q.query).trim() !== String(rec.primary_query || '').trim()) {
      errors.push(`${route}: admitted primary_query "${rec.primary_query}" does not match the registered query "${q.query}".`);
    }
  }

  // 3. The specific fallback shape that produced the retired pages: a query that
  //    is just the page's slug or title read back. Catch it by name so a future
  //    reintroduction is unmistakable rather than merely unmatched.
  const slug = String(rec.path || '').split('/').pop().replace(/\.html$/, '');
  const fromSlug = slug.replace(/-/g, ' ').toLowerCase().trim();
  if (!isPreGate && String(rec.primary_query || '').toLowerCase().trim() === fromSlug) {
    errors.push(`${route}: primary_query is the page slug read back as a sentence ("${rec.primary_query}"). That is the title-fallback that let a page justify itself.`);
  }
}

// The authority lane is the subject of this validator. If it examined none of
// its records, it proved nothing about the lane it names, and passing would
// misreport that as protection.
if (!authorityExamined) {
  console.error('[authority-admission-honesty] FAIL: no records carry generation_lane "authority", so the lane this validator governs was not examined at all.');
  process.exit(1);
}

if (errors.length) {
  console.error('[authority-admission-honesty] FAIL:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`[authority-admission-honesty] PASS: ${examined} admitted page(s) checked, ${authorityExamined} on the authority lane; no page claims a pre-gate admission level it did not earn, and every post-gate authority page stands on a registered query.`);
