#!/usr/bin/env node
/**
 * Answers one question about the intake corpus: which of these queries did
 * anybody actually type?
 *
 * Why this exists
 * ---------------
 * `data/intake/query_universe.json` holds 9,404 rows and `query_corpus.json`
 * holds 14,417. Each row carries a `source_type` - reddit, quora, tiktok,
 * x_twitter, google_paa, forums, youtube, competitor_pages, llm_citation_checks -
 * distributed almost evenly, roughly a thousand rows apiece. That distribution is
 * the tell. Real platform collection does not come out even.
 *
 * It is even because `source_type` is not a provenance record. In
 * `scripts/intake/build_query_universe.js` it is the innermost variable of a
 * four-deep loop:
 *
 *     for (role of roles)                     //  5
 *       for (audience of audiences)           // 14
 *         for (useCase of useCases)           // 24
 *           for (sourceType of sources)       //  9
 *             query = templates[...] with {role}/{audience}/{use_case} filled in
 *
 * Every row is a template expansion. The template is chosen by
 * `templates[(items.length + role.id.length + audience.id.length + useCase.id.length) % 10]`,
 * which is arithmetic on string lengths - not a signal, not even a hash of the
 * content. A row stamped `source_type: "reddit"` never touched Reddit; it is the
 * same cartesian cell as its eight siblings with a different label.
 *
 * The two files that do claim to be ingestion, `scripts/intake/adapters/reddit.js`
 * and `adapters/serp.js`, are hardcoded five-element string arrays. There is no
 * HTTP call in either, and no retained response, thread id, URL or capture
 * timestamp anywhere under `data/intake/source_ingestion/`.
 *
 * What this script does
 * ---------------------
 * It classifies every row as OBSERVED or GENERATED against one test: is there a
 * retained artifact showing this string came from outside this repo? It writes
 * the answer to `data/intake/query_provenance_audit.json`. It changes no query,
 * deletes nothing, and scores nothing.
 *
 * What it deliberately does not do
 * --------------------------------
 * It does not attach a demand number, an openness reading or a priority to any
 * row. Scoring a generated corpus produces a ranked generated corpus, which is
 * more convincing and no more true. The correct next step for this repo is to
 * collect real queries, not to rank invented ones.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p, fb) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fb; } };

// A source_type counts as OBSERVED only if a retained artifact exists that shows
// the string came from outside this repo: a captured URL, a thread or result id,
// a provider response, or a Search Console row. Nothing here qualifies today, and
// this table is where that changes when a real collector is built.
const OBSERVED_ARTIFACT_REQUIRED = {
  reddit: 'a thread URL or post id per query, retained',
  youtube: 'a video id or search response, retained',
  tiktok: 'a post id or search response, retained',
  x_twitter: 'a post id or search response, retained',
  quora: 'a question URL, retained',
  forums: 'a thread URL, retained',
  google_paa: 'a SERP capture containing the People-Also-Ask block, retained',
  competitor_pages: 'the competitor URL the query was extracted from, retained',
  llm_citation_checks: 'a probe observation with cited URLs, retained',
  authority_scale_max_fanout: 'not applicable - fanout is synthetic by definition',
  existing_repo: 'the repo route the string was read from',
};

const GENERATORS = {
  'data/intake/query_universe.json': 'scripts/intake/build_query_universe.js - 4-deep cartesian loop over product_role x audience x use_case x source_type, filled into one of 10 string templates',
  'data/intake/query_corpus.json': 'scripts/intake/collect_queries.js - the universe above plus data/intake/source_ingestion/*',
  'data/intake/source_ingestion/reddit.json': 'scripts/intake/adapters/reddit.js - a hardcoded 5-element string array; no network call, no retained thread',
  'data/intake/source_ingestion/serp.json': 'scripts/intake/adapters/serp.js - a hardcoded 5-element string array; no network call, no retained SERP',
  'data/intake/source_ingestion/max_fanout_window.json': 'authority-scale fanout - synthetic permutations, a hypothesis reserve',
};

// The fields that would carry evidence a query was observed. A row with none of
// them populated has no provenance, whatever its source_type label says.
const EVIDENCE_FIELDS = ['url', 'source_url', 'thread_url', 'permalink', 'post_id', 'thread_id', 'result_id', 'impressions', 'clicks', 'observed_url', 'captured_at', 'response_id'];
const hasEvidence = (row) => EVIDENCE_FIELDS.some((f) => row[f] !== undefined && row[f] !== null && row[f] !== '');

function classify(rows) {
  const observed = []; const generated = [];
  for (const r of rows) (hasEvidence(r) ? observed : generated).push(r);
  const bySource = {};
  for (const r of rows) {
    const k = r.source_type || 'unknown';
    bySource[k] = bySource[k] || { rows: 0, with_retained_evidence: 0 };
    bySource[k].rows++;
    if (hasEvidence(r)) bySource[k].with_retained_evidence++;
  }
  return { total: rows.length, observed: observed.length, generated: generated.length, by_source_type: bySource };
}

const files = {
  'data/intake/query_universe.json': (read('data/intake/query_universe.json', { queries: [] }).queries || []),
  'data/intake/query_corpus.json': (read('data/intake/query_corpus.json', { queries: [] }).queries || []),
  'data/intake/source_ingestion/reddit.json': (read('data/intake/source_ingestion/reddit.json', { queries: [] }).queries || []),
  'data/intake/source_ingestion/serp.json': (read('data/intake/source_ingestion/serp.json', { queries: [] }).queries || []),
};

const perFile = {};
for (const [file, rows] of Object.entries(files)) {
  perFile[file] = { generator: GENERATORS[file] || 'unknown', ...classify(rows) };
}

// Search Console is the one source that would produce observed queries without
// any scraping at all. Report its state rather than assume it.
const gscTruth = read('data/search_intelligence/gsc_truth.json', null);
const gscTargets = gscTruth?.per_target || [];
const gscWithRows = gscTargets.filter((t) => (t.impressions || 0) > 0 || t.status === 'HAS_GSC_ROW').length;

const totalObserved = Object.values(perFile).reduce((a, f) => a + f.observed, 0);
const totalRows = Object.values(perFile).reduce((a, f) => a + f.total, 0);

const audit = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  by: 'scripts/intake/audit_query_provenance.js',
  question: 'Which queries in this intake corpus did anybody actually type?',
  answer: totalObserved === 0
    ? 'None that this repo can show. Every row in the intake corpus is a template expansion or a hardcoded seed string. No retained artifact - no URL, thread id, SERP capture or Search Console row - backs any query in it.'
    : `${totalObserved} of ${totalRows} rows carry a retained artifact.`,
  truth_boundary: 'This audit says where a string came from. It says nothing about whether the string is a good page target; a generated query can still be a sensible one to write about. What it may not be is counted as demand.',
  observed_definition: 'A row is OBSERVED only when a retained artifact shows the string came from outside this repo: a captured URL, a thread or result id, a provider response, or a Search Console row.',
  evidence_fields_checked: EVIDENCE_FIELDS,
  observed_artifact_required_per_source: OBSERVED_ARTIFACT_REQUIRED,
  per_file: perFile,
  search_console: {
    provider_state: gscTruth?.provider_state || 'UNKNOWN',
    targets: gscTargets.length,
    targets_with_rows: gscWithRows,
    note: gscWithRows === 0
      ? 'Search Console returns no rows for any target. It cannot be a discovery source for this repo until the properties accumulate impressions.'
      : 'Search Console has rows; those queries are observed and should be ingested as evidence.',
  },
  what_was_not_done: 'No query in this corpus was scored by openness or lead intent, and no probe budget was spent on it. Scoring a generated corpus produces a ranked generated corpus - more convincing, no more true.',
  what_would_close_the_gap: [
    'A real collector for any one enabled source in config/source_expansion_policy.json that retains the artifact it read the query from.',
    'Search Console impressions on either property, which arrive on their own once pages are indexed and would be observed by definition.',
  ],
};

fs.writeFileSync(path.join(ROOT, 'data/intake/query_provenance_audit.json'), JSON.stringify(audit, null, 2) + '\n');

console.log(`[provenance] ${totalRows} intake rows across ${Object.keys(perFile).length} files; ${totalObserved} carry a retained artifact.`);
for (const [file, f] of Object.entries(perFile)) console.log(`  ${String(f.total).padStart(6)} rows  ${f.observed} observed  ${file}`);
console.log(`  Search Console: ${audit.search_console.provider_state}, ${gscWithRows}/${gscTargets.length} targets with rows.`);
