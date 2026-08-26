#!/usr/bin/env node
'use strict';
// Enforce the blocks the external review agent keeps asking for.
//
// Across ~2,750 recommendations audited on the sibling sites, the agent asks
// for the same small set of things over and over, and 27% of distinct defects
// were re-reported on later runs despite being marked released - the same page
// missing the same block, found again. This checks for those blocks before
// publish instead of after audit.
//
// Derived from the recommendations themselves (.clarity/content-pattern-spec.json
// in local-guides-citation-velocity):
//
//   1 checklist / numbered protocol      730 occurrences (36.4%)
//   2 comparison / decision / cost table 529 (26.4%)
//   3 direct-answer block                512 (25.5%)
//   5 concrete numbers                   365 (18.2%)
//   6 named primary sources              288 (14.3%)
//   7 query present in a heading         261 (13.0%)
//   9 FAQ block                          136 (6.8%)
//  10 structured data                     70 (3.5%)
//
// Severity is split: the blocks that decide whether a page can be quoted at all
// block the release; the rest report as gaps so they can be worked without
// stopping a release. All four blocking checks are at 100% on this repo, which
// is why they are registered blocking rather than reported.

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
// The public site is the repository root.
const ROOT = REPO;
const EVIDENCE = path.join(REPO, 'reports/validation/content-pattern-contract.json');
const ENFORCEMENT = 'block'; // 'block' | 'report'

// Templates are the source for generated pages, not published surfaces; the
// admin and agency dashboards are internal tools that answer no search query.
// The walk starts at the repository root, so every non-published top-level
// directory has to be excluded or test fixtures get judged as published pages.
// knowledge-map/ is deliberately NOT here - build_knowledge_map.js publishes
// knowledge-map/index.html.
const SKIP_DIRS = new Set([
  'templates', 'fixtures', 'tests', 'test', 'docs', 'scripts', 'data',
  'reports', 'artifacts', 'node_modules', '.git', '.github', 'site', 'dist',
]);
const SKIP_FILES = new Set(['admin.html', 'admin/index.html', 'agency/index.html', '404.html']);

// Navigational hub pages: their h1 is the section name ("FAQ", "Pillars"), which
// is correct for a taxonomy page and would be wrong to pad into a search query.
// They still owe every other check. Anything ending /index.html is a hub by
// construction; these are the non-index ones, listed so the exemption is
// auditable rather than inferred.
const HUB_FILES = new Set([
  'atlas.html', 'faq.html', 'glossary.html', 'legal.html', 'spry-labs.html',
  'start-here.html', 'pillars/body.html', 'pillars/mind.html',
  'pillars/money.html', 'pillars/spirit.html',
]);
const isHub = (rel) => rel.endsWith('index.html') || HUB_FILES.has(rel);

const text = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// Four shapes count as a direct answer, because the repo emits four. The
// generated families lead with <p class="citation-definition"> or a section
// marked data-llm-answer; older pages use a labelled heading; the rest carry a
// real opening paragraph. A stub of a few words is not self-contained, so the
// unlabelled form has to carry a real sentence.
const MIN_LEAD_CHARS = 80;
const leadLength = (html) => {
  const m = html.match(/<h1[^>]*>[\s\S]*?<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
  return m ? text(m[1]).length : 0;
};
const hasAnswer = (h) => /class="[^"]*citation-definition/i.test(h)
  || /data-llm-answer/i.test(h)
  || /<h[23][^>]*>\s*(?:Quick|Direct|Short)\s+answer/i.test(h)
  || leadLength(h) >= MIN_LEAD_CHARS;

// The conversion destination is the paid operating system. /download is the
// canonical handoff and produced both verified sales; aplayermode.com 301s to
// it, and gumroad.com is the checkout itself. All three are real paths to
// purchase, so all three satisfy the check.
const CONVERSION = /href="[^"]*(?:\/download(?:\.html)?"|aplayermode\.com|gumroad\.com)/i;

// The site's own domains are not cited sources, and font hosts are assets.
const EXTERNAL_SOURCE = /<a[^>]+href="https?:\/\/(?!(?:www\.)?spryexecutiveos\.com)(?!(?:www\.)?billionairehighperformancecoach\.com)(?!(?:www\.)?aplayermode\.com)(?!fonts\.(?:googleapis|gstatic)\.com)/i;

const CHECKS = [
  { id: 'direct_answer', blocking: true, test: hasAnswer,
    why: 'no direct-answer block - nothing here is quotable without surrounding context' },
  { id: 'query_in_heading', blocking: true,
    test: (h, rel) => {
      const m = h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (!m) return false;
      const len = text(m[1]).length;
      return isHub(rel) ? len > 0 : len > 10;
    },
    why: 'h1 missing or too short to carry the searcher phrasing' },
  { id: 'no_empty_table_cells', blocking: true,
    test: (h) => !/<t[dh][^>]*>\s*<\/t[dh]>/i.test(h),
    why: 'table ships empty cells - the agent calls these impossible to cite' },
  { id: 'conversion_path', blocking: true, test: (h) => CONVERSION.test(h),
    why: 'no conversion path - an answer-engine citation lands with nowhere to go' },
  { id: 'checklist', blocking: false, test: (h) => /<ol[\s>]|<ul[\s>]/i.test(h),
    why: 'no checklist or numbered protocol (agent request #1, 730 occurrences)' },
  { id: 'comparison_table', blocking: false, test: (h) => /<table[\s>]/i.test(h),
    why: 'no comparison or cost table (agent request #2, 529 occurrences)' },
  { id: 'concrete_numbers', blocking: false,
    test: (h) => /\$\s?\d|\d+\s?(?:days?|weeks?|months?|years?|hours?|minutes?)\b/i.test(text(h)),
    why: 'no concrete cost or timeline figures (agent request #5, 365 occurrences)' },
  { id: 'named_sources', blocking: false,
    test: (h) => /data-source|Primary sources|Sources?:/i.test(h) || EXTERNAL_SOURCE.test(h),
    why: 'no named primary source (agent request #6, 288 occurrences)' },
  { id: 'faq', blocking: false, test: (h) => /FAQPage|data-faq|class="[^"]*faq/i.test(h),
    why: 'no FAQ block or FAQPage schema (agent request #9)' },
  { id: 'structured_data', blocking: false, test: (h) => /application\/ld\+json/i.test(h),
    why: 'no JSON-LD structured data (agent request #10)' },
  // Added from the empirical spec (.clarity/content-pattern-spec.json v2.0), which
  // counts what the review agent actually asked for across 913 accepted
  // recommendations. These three were being missed entirely by the earlier list.
  { id: 'recommendation_summary', blocking: false,
    test: (h) => /data-bhpc-agent-block="recommendation_summary"|class="[^"]*recommendation-summary|<h[23][^>]*>\s*(?:What (?:we|this page) recommends?|Recommendation|Bottom line)/i.test(h),
    why: 'no recommendation summary - asked for on 913 of 913 agent recommendations, the single most requested block' },
  { id: 'definition_callout', blocking: false,
    test: (h) => /class="[^"]*citation-definition|data-bhpc-agent-block="definition_callout"|<(?:p|div)[^>]*>\s*<strong>[^<]{40,}<\/strong>/i.test(h),
    why: 'no definition callout (agent requested 196 times) - this is what an answer engine lifts for "what is X"' },
  { id: 'trust_block', blocking: false,
    test: (h) => /data-bhpc-agent-block="trust_block"|class="[^"]*(?:trust|author|byline)|rel="author"|itemprop="author"/i.test(h),
    why: 'no trust or authorship block (agent requested 215 times) - entity clarity is a citation factor' },
];

const pages = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(abs); continue; }
    if (!entry.name.endsWith('.html')) continue;
    const rel = path.relative(ROOT, abs);
    if (SKIP_FILES.has(rel)) continue;
    pages.push(rel);
  }
})(ROOT);
pages.sort();

const blockingFailures = [];
const gaps = {};
for (const check of CHECKS) gaps[check.id] = [];

for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const check of CHECKS) {
    if (check.test(html, rel)) continue;
    if (check.blocking) blockingFailures.push({ path: rel, check: check.id, why: check.why });
    else gaps[check.id].push(rel);
  }
}

const summary = CHECKS.map((check) => {
  const missing = check.blocking
    ? blockingFailures.filter((f) => f.check === check.id).length
    : gaps[check.id].length;
  return {
    id: check.id,
    blocking: check.blocking,
    pages_missing: missing,
    coverage_pct: Number((100 * (1 - missing / Math.max(pages.length, 1))).toFixed(1)),
    why: check.why,
  };
});

fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify({
  schema_version: '1.0',
  validator: 'content-pattern-contract',
  generated_at: new Date().toISOString(),
  enforcement: ENFORCEMENT,
  scanned_root: path.relative(REPO, ROOT) || '.',
  pages_checked: pages.length,
  status: blockingFailures.length ? (ENFORCEMENT === 'block' ? 'FAIL' : 'REPORTED') : 'PASS',
  blocking_failures: blockingFailures.length,
  summary,
  worst_gaps: Object.fromEntries(Object.entries(gaps).map(([k, v]) => [k, v.slice(0, 25)])),
  blocking_backlog: blockingFailures.slice(0, 200),
}, null, 2)}\n`);

console.log(`CONTENT PATTERN CONTRACT: ${pages.length} pages checked (enforcement: ${ENFORCEMENT})`);
for (const s of summary) {
  const tag = s.blocking ? 'BLOCKING' : 'gap     ';
  console.log(`  ${tag} ${s.id.padEnd(22)} coverage ${String(s.coverage_pct).padStart(5)}%  missing on ${s.pages_missing}`);
}
if (blockingFailures.length) {
  const log = ENFORCEMENT === 'block' ? console.error : console.warn;
  log(`\nCONTENT PATTERN CONTRACT: ${blockingFailures.length} blocking gap(s)`);
  for (const f of blockingFailures.slice(0, 15)) log(`  ${f.path} :: ${f.why}`);
  if (blockingFailures.length > 15) log(`  ...and ${blockingFailures.length - 15} more`);
  if (ENFORCEMENT === 'block') process.exit(1);
  console.warn('  reported, not blocking, while the backlog above is worked.');
  process.exit(0);
}
console.log('\nCONTENT PATTERN CONTRACT PASS');
