#!/usr/bin/env node
// Guard: the target set must contain the queries Google actually shows.
//
// 25 Oct 2026: gsc_truth.json had filter_discarded_every_row: true - 124 real rows
// in, 0 matched against 120 targets built only from the intake universe, so the
// search-intelligence loop ran on nothing. This proves, with no network:
//   1. measuredQueries() rolls up both export shapes (full measured_queries, and
//      the older rows + discarded_sample), dedups across hosts, applies the floor.
//   2. The real builder, run against the committed exports, puts every measured
//      query (up to the cap) into the set, mapped to an existing non-agent page,
//      so the export's exact-match filter keeps those rows.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { measuredQueries, readExports, pathKey, MEASURED_MIN_IMPRESSIONS } from './lib/measured_targets.mjs';

const errors = [];
const eq = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) errors.push(`${name}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };

const fresh = { measured_queries: [
  { query: 'ai executive coaching', impressions: 43, clicks: 0, top_page: 'https://a.example/ai-executive-coach' },
  { query: 'one-off', impressions: 1, clicks: 0, top_page: 'https://a.example/x' },
] };
const older = { rows: [], target_query_filter: { discarded_sample: [
  { query: 'AI Executive Coaching', page: 'https://b.example/y', impressions: 3, clicks: 1 },
  { query: 'ai coaching vs betterup', page: 'https://b.example/comparisons/bhpc-vs-betterup', impressions: 16, clicks: 0 },
] } };
const m = measuredQueries([fresh, older]);
eq('measured order', m.map((x) => x.query), ['ai executive coaching', 'ai coaching vs betterup']);
eq('cross-host rollup', [m[0].impressions, m[0].clicks, m[0].top_page], [46, 1, 'https://a.example/ai-executive-coach']);
eq('floor', MEASURED_MIN_IMPRESSIONS, 2);
eq('pathKey', [pathKey('https://x.example/a/b.html'), pathKey('/a/b/'), pathKey('https://x.example/')], ['/a/b', '/a/b', '/']);

const exportsNow = readExports();
const want = measuredQueries(exportsNow);
const rawRows = exportsNow.reduce((n, d) => n + Number(d.raw_row_count || 0), 0);
if (rawRows > 0 && !want.length) errors.push(`committed exports carry ${rawRows} raw rows but yield no measured query`);

// .build/ is gitignored; writeJson resolves paths against the repo root.
const tmp = `.build/self-test-measured-targets-${process.pid}.json`;
fs.mkdirSync('.build', { recursive: true });
execFileSync(process.execPath, ['scripts/search_intelligence/build_target_query_set.mjs'],
  { env: { ...process.env, SEARCH_INTELLIGENCE_TARGET_OUT: tmp }, stdio: 'pipe' });
const set = JSON.parse(fs.readFileSync(tmp, 'utf8'));
fs.rmSync(tmp, { force: true });
const max = Number(process.env.SEARCH_INTELLIGENCE_MAX_TARGETS || 120);
const targetQueries = new Set(set.targets.map((t) => String(t.query).toLowerCase()));
const missing = want.slice(0, max).filter((x) => !targetQueries.has(x.query));
if (missing.length) errors.push(`${missing.length} measured queries left out of the target set, e.g. ${missing[0].query}`);
eq('measured_target_count', set.measured_target_count, Math.min(want.length, max));
for (const t of set.targets) {
  if (!t.owned_file || !fs.existsSync(t.owned_file)) errors.push(`target ${t.query} has no existing owned file`);
}
// What the export filter would keep from what Google returned (sample rows on disk).
let kept = 0;
for (const d of exportsNow) for (const r of [...(d.rows || []), ...(d.target_query_filter?.discarded_sample || [])]) {
  if (targetQueries.has(String(r.query).toLowerCase())) kept += 1;
}
if (rawRows > 0 && kept === 0) errors.push('the target set still matches none of the rows Google returned');

if (errors.length) { console.error(`[search:measured-targets:self-test] FAIL\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log(`[search:measured-targets:self-test] PASS measured=${want.length} in_set=${set.measured_target_count} rows_kept=${kept}`);
