#!/usr/bin/env node
/**
 * Prove the GSC truth health signal reacts to data, not to file presence.
 *
 * The defect this locks down: `const state = exports.length ? OK : UNAVAILABLE`
 * reported `status_is_healthy: true` over two export files whose row_count was 0
 * on both, and a search-measurement lane sat at zero for weeks calling itself
 * healthy. The fourth case below is the one that mattered in production - Google
 * returned real rows and the target-query filter discarded every one of them,
 * which the old shape wrote out as an indistinguishable `row_count: 0`.
 *
 * Each case runs the real ingest against fixture exports under .build/ and
 * asserts the resulting state. The `old_rule_would_say_healthy` field records
 * what the replaced rule would have concluded, so the regression is visible in
 * the report rather than asserted in prose.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const BASE = '.build/self-test/gsc-truth';
const INGEST = 'scripts/search_intelligence/ingest_gsc_truth.mjs';

const TARGETS = {
  targets: [
    { target_id: 'st_hit', query: 'measured target query', expected_owned_url: 'https://spryexecutiveos.com/a/' },
    { target_id: 'st_miss', query: 'synthetic long tail nobody searches', expected_owned_url: 'https://spryexecutiveos.com/b/' },
  ],
};

const row = (query, page) => ({ site_url: 'sc-domain:spryexecutiveos.com', query, page, clicks: 1, impressions: 40, ctr: 0.025, gsc_average_position: 62.7 });

function exportFile({ raw, rows }) {
  const discarded = raw - rows.length;
  return {
    provider: 'google_search_console',
    site_url: 'sc-domain:spryexecutiveos.com',
    start_date: '2026-05-26',
    end_date: '2026-08-23',
    collected_at: '2026-08-28',
    raw_row_count: raw,
    raw_distinct_query_count: raw,
    raw_impressions: raw * 13,
    raw_clicks: raw ? 1 : 0,
    row_count: rows.length,
    target_query_filter: { target_query_count: 2, rows_in: raw, rows_matched: rows.length, rows_discarded: discarded },
    rows,
  };
}

const cases = [
  {
    name: 'HEALTHY: provider returned rows and a target matched',
    exports: { gsc_spry: exportFile({ raw: 69, rows: [row('measured target query', 'https://spryexecutiveos.com/a/')] }) },
    expect: { data_state: 'HEALTHY', provider_state: 'OK', status_is_healthy: true },
    old_rule_would_say_healthy: true,
  },
  {
    name: 'NO_DATA_RETURNED: provider answered with zero rows (the reported-zeros defect)',
    exports: { gsc_spry: exportFile({ raw: 0, rows: [] }), gsc_bhpc: exportFile({ raw: 0, rows: [] }) },
    expect: { data_state: 'NO_DATA_RETURNED', provider_state: 'DEGRADED', status_is_healthy: false },
    old_rule_would_say_healthy: true,
  },
  {
    name: 'PROVIDER_UNAVAILABLE: no export produced at all',
    exports: {},
    expect: { data_state: 'PROVIDER_UNAVAILABLE', provider_state: 'UNAVAILABLE', status_is_healthy: false },
    old_rule_would_say_healthy: false,
  },
  {
    name: 'RAW_COUNT_UNKNOWN: legacy export with no raw_row_count cannot be called healthy',
    exports: { gsc_spry: { site_url: 'sc-domain:spryexecutiveos.com', rows: [] } },
    expect: { data_state: 'RAW_COUNT_UNKNOWN', provider_state: 'DEGRADED', status_is_healthy: false },
    old_rule_would_say_healthy: true,
  },
  {
    name: 'Full discard is visible: 69 raw rows in, 0 survive the target filter',
    exports: { gsc_spry: exportFile({ raw: 69, rows: [] }) },
    expect: { data_state: 'HEALTHY', provider_state: 'OK', status_is_healthy: true, raw_row_count: 69, row_count: 0, filter_discarded_every_row: true },
    old_rule_would_say_healthy: true,
  },
];

const errors = [];
const results = [];

for (const [i, c] of cases.entries()) {
  const dir = path.join(BASE, `case-${i}`);
  const inputDir = path.join(dir, 'inputs');
  const outFile = path.join(dir, 'gsc_truth.json');
  const targetFile = path.join(dir, 'targets.json');
  fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
  fs.mkdirSync(path.join(ROOT, inputDir), { recursive: true });
  fs.writeFileSync(path.join(ROOT, targetFile), JSON.stringify(TARGETS));
  for (const [name, body] of Object.entries(c.exports)) {
    fs.writeFileSync(path.join(ROOT, inputDir, `${name}.json`), JSON.stringify(body, null, 2));
  }
  execFileSync(process.execPath, [INGEST], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, GSC_TRUTH_INPUT_DIR: inputDir, GSC_TRUTH_OUTPUT: outFile, GSC_TRUTH_TARGET_SET: targetFile },
  });
  const got = JSON.parse(fs.readFileSync(path.join(ROOT, outFile), 'utf8'));
  const actual = {
    data_state: got.data_state,
    provider_state: got.provider_state,
    status_is_healthy: got.status_is_healthy,
    raw_row_count: got.raw_row_count,
    row_count: got.row_count,
    filter_discarded_every_row: got.target_query_filter?.filter_discarded_every_row,
  };
  for (const [k, v] of Object.entries(c.expect)) {
    if (actual[k] !== v) errors.push(`${c.name}: expected ${k}=${JSON.stringify(v)}, got ${JSON.stringify(actual[k])}`);
  }
  // The regression itself: wherever the replaced rule would have said healthy and
  // the data does not support it, the new rule has to disagree.
  if (c.old_rule_would_say_healthy && !c.expect.status_is_healthy && actual.status_is_healthy) {
    errors.push(`${c.name}: new rule reproduced the old file-presence health verdict`);
  }
  results.push({ case: c.name, old_rule_healthy: c.old_rule_would_say_healthy, ...actual });
}

const report = { schema_version: '1.0', generated_at: new Date().toISOString(), status: errors.length ? 'FAIL' : 'PASS', case_count: cases.length, results, errors };
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/search-gsc-truth-health-self-test.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
