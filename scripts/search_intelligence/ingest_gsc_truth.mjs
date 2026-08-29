#!/usr/bin/env node
/**
 * Fold the per-property Search Console exports into one truth file.
 *
 * Health used to mean "two files exist on disk": `const state = exports.length ?
 * OK : UNAVAILABLE`. That is a filesystem check wearing a data check's name, and
 * it reported OK over a dataset in which every single row_count was 0 - which is
 * precisely why an empty search-measurement lane went unnoticed.
 *
 * Health now requires data. Three conditions are named separately, because they
 * call for three different responses:
 *
 *   HEALTHY            - the provider returned rows. (provider_state OK)
 *   NO_DATA_RETURNED   - the provider answered, and the answer was empty. A
 *                        legitimate state for a young or unindexed property, so
 *                        it degrades rather than fails. (DEGRADED)
 *   RAW_COUNT_UNKNOWN  - the export predates raw-count recording, so we cannot
 *                        tell an empty response from a fully filtered one.
 *                        (DEGRADED)
 *   PROVIDER_UNAVAILABLE - no export was produced at all. (UNAVAILABLE)
 *
 * The distinction that matters: `raw_row_count` is what Google returned;
 * `row_count` is what survived the target-query filter. A run where Google
 * returned 895 impressions across 69 queries and the 120-phrase target set
 * matched none of them is a targeting problem, not an indexing problem, and the
 * filter block below is what makes that visible instead of silent.
 */
import fs from 'node:fs';
import { readJson, writeJson, stamp, OK, DEGRADED, UNAVAILABLE } from './lib/core.mjs';

const HEALTHY = 'HEALTHY';
const NO_DATA_RETURNED = 'NO_DATA_RETURNED';
const RAW_COUNT_UNKNOWN = 'RAW_COUNT_UNKNOWN';
const PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE';

// Repo-relative overrides exist so the self-test can drive this against fixtures
// without touching the real exports. Production runs pass neither.
const TARGET_SET = process.env.GSC_TRUTH_TARGET_SET || 'data/search_intelligence/target_query_set.json';
const INPUT_DIR = process.env.GSC_TRUTH_INPUT_DIR || 'data/search_intelligence/provider_inputs';
const OUTPUT = process.env.GSC_TRUTH_OUTPUT || 'data/search_intelligence/gsc_truth.json';

const targets = readJson(TARGET_SET, { targets: [] }).targets || [];
const files = ['gsc_bhpc.json', 'gsc_spry.json'].map((f) => `${INPUT_DIR}/${f}`);

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

let rows = [];
const exports_ = [];
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const exportRows = d.rows || [];
  rows.push(...exportRows);
  const rawRowCount = num(d.raw_row_count);
  const filter = d.target_query_filter || {};
  exports_.push({
    path: f,
    site_url: d.site_url || null,
    start_date: d.start_date || null,
    end_date: d.end_date || null,
    collected_at: d.collected_at || null,
    // Pre-filter: what the provider returned. null means this export was written
    // by a version that did not record it - unknown, not zero.
    raw_row_count: rawRowCount,
    raw_distinct_query_count: num(d.raw_distinct_query_count),
    raw_impressions: num(d.raw_impressions),
    raw_clicks: num(d.raw_clicks),
    // Post-filter: unchanged meaning.
    row_count: exportRows.length,
    rows_discarded_by_target_filter: num(filter.rows_discarded),
    discarded_impressions: num(filter.discarded_impressions),
    discarded_clicks: num(filter.discarded_clicks),
    data_state: rawRowCount === null ? RAW_COUNT_UNKNOWN : rawRowCount > 0 ? HEALTHY : NO_DATA_RETURNED,
  });
}

const host = (u) => { try { return new URL(String(u)).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; } };
const per = targets.map((t) => {
  const expectedHost = host(t.expected_owned_url);
  const rs = rows.filter((r) => String(r.query || '').toLowerCase() === String(t.query).toLowerCase() && (!expectedHost || host(r.page) === expectedHost));
  const agg = rs.reduce((a, r) => ({
    clicks: a.clicks + Number(r.clicks || 0),
    impressions: a.impressions + Number(r.impressions || 0),
    weightedPosition: a.weightedPosition + (Number(r.gsc_average_position || 0) * Math.max(1, Number(r.impressions || 0))),
    weight: a.weight + Math.max(1, Number(r.impressions || 0)),
    pages: a.pages.concat(r.page ? [r.page] : []),
  }), { clicks: 0, impressions: 0, weightedPosition: 0, weight: 0, pages: [] });
  return {
    target_id: t.target_id,
    query: t.query,
    expected_owned_url: t.expected_owned_url,
    truth_source: 'google_search_console',
    truth_state: rs.length ? 'GSC_ROW_PRESENT' : 'NO_GSC_ROW',
    query_metrics: rs.length ? {
      clicks: agg.clicks,
      impressions: agg.impressions,
      ctr: agg.impressions ? agg.clicks / agg.impressions : 0,
      gsc_average_position: agg.weight ? agg.weightedPosition / agg.weight : null,
      pages: [...new Set(agg.pages)],
    } : null,
  };
});

const sum = (key) => exports_.reduce((a, e) => (e[key] === null ? a : a + e[key]), 0);
const anyUnknown = exports_.some((e) => e.raw_row_count === null);
const rawRowCount = !exports_.length || exports_.every((e) => e.raw_row_count === null) ? null : sum('raw_row_count');
const filteredRowCount = rows.length;

let dataState;
if (!exports_.length) dataState = PROVIDER_UNAVAILABLE;
else if (anyUnknown) dataState = RAW_COUNT_UNKNOWN;
else if ((rawRowCount || 0) > 0) dataState = HEALTHY;
else dataState = NO_DATA_RETURNED;

// Health is data, not file presence.
const isHealthy = dataState === HEALTHY;
// An honestly-empty property must not break the lane, so it degrades. Only a
// missing export is UNAVAILABLE.
const state = dataState === HEALTHY ? OK : dataState === PROVIDER_UNAVAILABLE ? UNAVAILABLE : DEGRADED;

const notes = {
  [HEALTHY]: null,
  [NO_DATA_RETURNED]: 'Search Console answered for every configured property and returned zero rows in the window. This is a legitimate state for an unindexed or brand-new property; it is not a healthy measurement.',
  [RAW_COUNT_UNKNOWN]: 'At least one export does not record raw_row_count, so an empty provider response cannot be distinguished from a fully filtered one. Re-run scripts/search_intelligence/gsc_search_analytics.py to produce a countable export.',
  [PROVIDER_UNAVAILABLE]: 'No Google Search Console Search Analytics export available for this run.',
};

const matchedTargets = per.filter((x) => x.truth_state === 'GSC_ROW_PRESENT').length;

writeJson(OUTPUT, {
  schema_version: '1.2',
  generated_at: stamp(),
  provider_state: state,
  overall_status: state,
  data_state: dataState,
  status_is_healthy: isHealthy,
  // Pre-filter totals. Zero here means Google returned nothing.
  raw_row_count: rawRowCount,
  raw_impressions: anyUnknown ? null : sum('raw_impressions'),
  raw_clicks: anyUnknown ? null : sum('raw_clicks'),
  // Post-filter total, the historical `row_count` meaning.
  row_count: filteredRowCount,
  // What the target-query filter did. A large discard with a healthy raw count
  // is a targeting failure, and it must not read as "no search data".
  target_query_filter: {
    target_query_count: targets.length,
    rows_in: rawRowCount,
    rows_matched: filteredRowCount,
    rows_discarded: rawRowCount === null ? null : rawRowCount - filteredRowCount,
    discard_ratio: rawRowCount ? (rawRowCount - filteredRowCount) / rawRowCount : rawRowCount === null ? null : 0,
    targets_with_rows: matchedTargets,
    filter_discarded_every_row: rawRowCount !== null && rawRowCount > 0 && filteredRowCount === 0,
  },
  exports: exports_,
  unavailable_note: notes[dataState],
  per_target: per,
});

console.log(`[search:truth] ${state} data_state=${dataState} raw_rows=${rawRowCount === null ? 'unknown' : rawRowCount} matched_rows=${filteredRowCount} matched_targets=${matchedTargets}`);
