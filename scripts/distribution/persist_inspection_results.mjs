#!/usr/bin/env node
/**
 * Reduce the raw GSC URL Inspection responses into a small, stable verdict ledger.
 *
 * The deploy already calls the URL Inspection API for ~30 URLs per run and writes
 * `.build/inspection-results-*.json`. `.build/` is gitignored and was never
 * uploaded, so every verdict was thrown away the moment the runner terminated -
 * while the quota it cost had already been spent.
 *
 * Those verdicts are the only direct evidence separating
 *   "Crawled - currently not indexed"    (Google fetched it and declined) from
 *   "Discovered - currently not indexed" (Google never fetched it),
 * which is the difference between a quality judgement and a technical block. That
 * distinction cannot be reconstructed from Search Analytics, from a crawl, or
 * from the sitemap.
 *
 * Two design constraints:
 *
 *  - Small. A raw inspection response is a few KB of nested envelope per URL. Only
 *    the verdict fields are kept.
 *  - Stable. `lastCrawlTime`, `referringUrls` and the like move on every run and
 *    would make this file churn in every deploy for no information. They are
 *    dropped, and a record whose verdict hash is unchanged is written back
 *    byte-identical - including its timestamps - so an unchanged verdict produces
 *    an empty diff. `first_seen` and `last_changed` therefore mean what they say.
 *
 * Usage: persist_inspection_results.mjs <ledger.json> <raw-inspection.json>...
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const LEDGER_VERSION = '1.0';
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('usage: persist_inspection_results.mjs <ledger.json> <raw-inspection.json>...');
  process.exit(2);
}
const [ledgerPath, ...rawPaths] = args;
const today = (process.env.GSC_INSPECTION_DATE || new Date().toISOString().slice(0, 10));

const prior = (() => {
  try { return JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); } catch { return { records: [] }; }
})();
const priorByUrl = new Map((prior.records || []).map((r) => [r.url, r]));

// Only the fields that carry a verdict. Everything volatile is deliberately absent.
function verdictOf(result) {
  const idx = result?.inspectionResult?.indexStatusResult || {};
  const mobile = result?.inspectionResult?.mobileUsabilityResult || {};
  const rich = result?.inspectionResult?.richResultsResult || {};
  return {
    coverage_state: idx.coverageState ?? null,
    indexing_state: idx.indexingState ?? null,
    robots_txt_state: idx.robotsTxtState ?? null,
    page_fetch_state: idx.pageFetchState ?? null,
    crawled_as: idx.crawledAs ?? null,
    google_canonical: idx.googleCanonical ?? null,
    user_canonical: idx.userCanonical ?? null,
    sitemap_count: Array.isArray(idx.sitemap) ? idx.sitemap.length : null,
    mobile_usability_verdict: mobile.verdict ?? null,
    rich_results_verdict: rich.verdict ?? null,
  };
}

const seen = new Map();
let rawFiles = 0;
let rawRecords = 0;
let unresolved = 0;
for (const p of rawPaths) {
  if (!fs.existsSync(p)) continue;
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {
    console.error(`[inspection:persist] unreadable ${p}: ${e.message}`);
    process.exit(1);
  }
  rawFiles += 1;
  // The Inspection API response does not echo the URL that was inspected, so the
  // inspector pairs each response with its request URL. A bare array is the
  // legacy shape and is only usable where the entry carries the url itself.
  const entries = Array.isArray(parsed) ? parsed : (parsed.results || []);
  for (const entry of entries) {
    const url = entry?.url || entry?.inspected_url || null;
    const result = entry?.inspection || entry;
    if (!url) { unresolved += 1; continue; }
    rawRecords += 1;
    seen.set(url, verdictOf(result));
  }
}
if (unresolved) {
  console.error(`[inspection:persist] ${unresolved} raw result(s) carried no inspected URL and cannot be attributed; re-run gsc_inspect_urls.py`);
  process.exit(1);
}

const records = [];
for (const [url, verdict] of [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(verdict)).digest('hex').slice(0, 16);
  const was = priorByUrl.get(url);
  if (was && was.verdict_sha256 === hash) {
    // Unchanged verdict: write the previous record back untouched so the deploy
    // does not produce a diff for a result that did not move.
    records.push(was);
    continue;
  }
  records.push({ url, ...verdict, verdict_sha256: hash, first_seen: was?.first_seen || today, last_changed: today });
}
// URLs no longer inspected this run keep their last known verdict rather than
// disappearing; a shrinking priority list is not evidence of a changed verdict.
for (const [url, was] of priorByUrl) if (!seen.has(url)) records.push(was);
records.sort((a, b) => a.url.localeCompare(b.url));

const tally = (key) => records.reduce((acc, r) => { const k = r[key] || 'UNKNOWN'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
const ledger = {
  schema_version: LEDGER_VERSION,
  source: 'google_search_console_url_inspection',
  // Derived only from record contents, so an unchanged run rewrites the same bytes.
  url_count: records.length,
  last_changed: records.reduce((a, r) => (r.last_changed > a ? r.last_changed : a), ''),
  coverage_state_counts: tally('coverage_state'),
  page_fetch_state_counts: tally('page_fetch_state'),
  records,
};

fs.mkdirSync(path.dirname(path.resolve(ledgerPath)), { recursive: true });
const next = JSON.stringify(ledger, null, 2) + '\n';
const before = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : '';
if (before === next) {
  console.log(`[inspection:persist] ${records.length} verdicts unchanged; ${ledgerPath} not rewritten`);
} else {
  fs.writeFileSync(ledgerPath, next);
  console.log(`[inspection:persist] ${records.length} verdicts from ${rawRecords} raw results across ${rawFiles} file(s) -> ${ledgerPath}`);
}
console.log(`[inspection:persist] coverage: ${JSON.stringify(ledger.coverage_state_counts)}`);
