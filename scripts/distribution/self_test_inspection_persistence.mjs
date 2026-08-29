#!/usr/bin/env node
/**
 * Prove the URL Inspection verdicts survive a run, and that persisting them does
 * not churn.
 *
 * Before: the deploy wrote `.build/inspection-results-*.json`, `.build/` is
 * gitignored and nothing uploaded it, so a paid-for API verdict lived exactly as
 * long as the runner. Case 1 below asserts the reduction actually captures the
 * one distinction the call was made for - CRAWLED vs DISCOVERED "currently not
 * indexed" - rather than a count.
 *
 * Case 2 is the negative test for churn: re-running against an identical raw
 * input must leave the ledger byte-identical, because a ledger that rewrites its
 * own timestamps on every deploy is noise, and noise gets ignored.
 *
 * Case 3 is the negative test for the shape regression: a raw file in the old
 * bare-array form carries no inspected URL, cannot be attributed, and must fail
 * loudly instead of silently persisting anonymous verdicts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const DIR = path.join(ROOT, '.build/self-test/inspection');
const SCRIPT = 'scripts/distribution/persist_inspection_results.mjs';
const errors = [];

const inspection = (url, coverageState, pageFetchState) => ({
  url,
  inspection: {
    inspectionResult: {
      inspectionResultLink: `https://search.google.com/search-console/inspect?url=${encodeURIComponent(url)}`,
      indexStatusResult: {
        verdict: 'NEUTRAL',
        coverageState,
        robotsTxtState: 'ALLOWED',
        indexingState: 'INDEXING_ALLOWED',
        // Volatile: must not reach the ledger, or every deploy diffs.
        lastCrawlTime: new Date().toISOString(),
        pageFetchState,
        googleCanonical: url,
        userCanonical: url,
        sitemap: ['https://spryexecutiveos.com/sitemap-spry.xml'],
        referringUrls: ['https://spryexecutiveos.com/'],
        crawledAs: 'MOBILE',
      },
      mobileUsabilityResult: { verdict: 'PASS' },
    },
  },
});

const raw = {
  provider: 'google_search_console_url_inspection',
  site_url: 'sc-domain:spryexecutiveos.com',
  collected_at: '2026-08-28',
  requested_url_count: 3,
  results: [
    inspection('https://spryexecutiveos.com/a/', 'Crawled - currently not indexed', 'SUCCESSFUL'),
    inspection('https://spryexecutiveos.com/b/', 'Discovered - currently not indexed', 'PAGE_FETCH_STATE_UNSPECIFIED'),
    inspection('https://spryexecutiveos.com/c/', 'Submitted and indexed', 'SUCCESSFUL'),
  ],
};

fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });
const rawPath = path.join(DIR, 'inspection-results-spry.json');
const ledgerPath = path.join(DIR, 'ledger.json');
fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2));

const run = (env = {}) => execFileSync(process.execPath, [SCRIPT, ledgerPath, rawPath], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });

// Case 1 - the verdicts are captured, and the crawl distinction survives.
run({ GSC_INSPECTION_DATE: '2026-08-28' });
const first = fs.readFileSync(ledgerPath, 'utf8');
const ledger = JSON.parse(first);
const byUrl = Object.fromEntries(ledger.records.map((r) => [r.url, r]));
if (byUrl['https://spryexecutiveos.com/a/']?.coverage_state !== 'Crawled - currently not indexed') errors.push('CRAWLED verdict not persisted');
if (byUrl['https://spryexecutiveos.com/b/']?.coverage_state !== 'Discovered - currently not indexed') errors.push('DISCOVERED verdict not persisted');
if (byUrl['https://spryexecutiveos.com/a/']?.page_fetch_state !== 'SUCCESSFUL') errors.push('page_fetch_state not persisted');
if (ledger.coverage_state_counts?.['Crawled - currently not indexed'] !== 1) errors.push('coverage tally wrong');
if (/lastCrawlTime|referringUrls|last_crawl_time/.test(first)) errors.push('volatile fields leaked into the ledger and will churn every deploy');
// Size is asserted per record rather than against the fixture's raw size: the
// fixture is a trimmed envelope, so a ratio against it would be a test of the
// fixture. What has to hold is that a record stays bounded, so ~30 URLs a run
// cannot grow into a file nobody will read.
const bytesPerRecord = first.length / ledger.records.length;
if (bytesPerRecord > 800) errors.push(`ledger record is ${Math.round(bytesPerRecord)} bytes; it is carrying more than a verdict`);
const reductionRatio = first.length / fs.readFileSync(rawPath, 'utf8').length;

// Case 2 - negative test for churn: an unchanged verdict on a later day must not
// move a single byte.
run({ GSC_INSPECTION_DATE: '2026-09-05' });
const second = fs.readFileSync(ledgerPath, 'utf8');
if (second !== first) errors.push('re-running against identical input rewrote the ledger; it will churn on every deploy');

// ...but a verdict that genuinely changed must be recorded, with last_changed moving.
const changed = JSON.parse(JSON.stringify(raw));
changed.results[1].inspection.inspectionResult.indexStatusResult.coverageState = 'Submitted and indexed';
fs.writeFileSync(rawPath, JSON.stringify(changed, null, 2));
run({ GSC_INSPECTION_DATE: '2026-09-05' });
const third = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const b = third.records.find((r) => r.url === 'https://spryexecutiveos.com/b/');
if (b?.coverage_state !== 'Submitted and indexed') errors.push('a changed verdict was not recorded');
if (b?.last_changed !== '2026-09-05') errors.push('last_changed did not move on a real change');
if (b?.first_seen !== '2026-08-28') errors.push('first_seen was overwritten');
const a = third.records.find((r) => r.url === 'https://spryexecutiveos.com/a/');
if (a?.last_changed !== '2026-08-28') errors.push('an unchanged record had its last_changed bumped');

// Case 3 - negative test for the unattributable legacy shape.
const legacyPath = path.join(DIR, 'legacy.json');
fs.writeFileSync(legacyPath, JSON.stringify(raw.results.map((r) => r.inspection), null, 2));
let legacyExit = 0;
try {
  execFileSync(process.execPath, [SCRIPT, path.join(DIR, 'legacy-ledger.json'), legacyPath], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
} catch (e) { legacyExit = e.status; }
if (legacyExit === 0) errors.push('a raw file with no inspected URLs was accepted; verdicts would be persisted unattributed');

const report = {
  schema_version: '1.0',
  status: errors.length ? 'FAIL' : 'PASS',
  persisted_url_count: ledger.url_count,
  coverage_states: ledger.coverage_state_counts,
  bytes_per_record: Math.round(bytesPerRecord),
  size_ratio_ledger_over_raw: Number(reductionRatio.toFixed(3)),
  rerun_is_byte_identical: second === first,
  unattributable_raw_rejected: legacyExit !== 0,
  errors,
};
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/inspection-persistence-self-test.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
