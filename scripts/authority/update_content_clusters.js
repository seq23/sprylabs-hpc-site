#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

// Cluster memory: what the social/reddit listeners have observed, per topic.
//
// THIS FILE WAS THE RECURRENCE ENGINE FOR THE DAILY CI FAILURE. What it used to
// do, on line 20 of the previous revision:
//
//     existing.signal_count += 1;
//
// main() reloads the previous memory (which already carries every count from
// every prior run), then re-walks the WHOLE source window - the last 14 social
// run files plus the entire reddit queries file - and adds 1 for each record it
// finds. Nothing deduplicated a record against one already counted. The same
// unchanged source rows were therefore re-counted on every single pipeline run.
//
// Measured on unchanged inputs, three consecutive runs (2026-09-02):
//
//     coaching-accountability   18/74 -> 20/80 -> 22/86 -> 24/92   (signal_count/authority_potential)
//     ...while the number of DISTINCT signal titles in that cluster stayed at 1.
//
// authority_potential is signal_count*3, so it climbed ~+6 per run carrying no
// new information. scripts/authority/cluster_to_authority.js promotes any
// cluster scoring >= 70 into the authority paper queue, and
// scripts/build_authority_papers.js publishes it as a public whitepaper. So
// EVERY tracked cluster was guaranteed to be published eventually, on a timer,
// regardless of whether anyone had ever asked about it a second time.
//
// That is why the failure kept coming back after being "fixed". Each previous
// pass deleted the offending pages. Deleting output never touched the counter,
// so the next cluster crossed 70 a few days later and manufactured a new one.
// At the time of the fix, three clusters sat at 69 - one run from promotion.
//
// THE FIX: signal_count is derived, never incremented. Each observation gets a
// stable identity key and the cluster stores the set of keys it has ever seen;
// the count is that set's size. Re-running on unchanged inputs is now a no-op,
// which is the property the rest of this pipeline already assumes (see the
// "a clean build changes nothing" work in commit c16e04cce).
//
// Guarded by scripts/validators/validate_cluster_signal_integrity.mjs, which
// re-runs this script and hard-fails if any count moves.

const fs = require('fs');
const path = require('path');
const { applySignalKeys } = require('../lib/cluster_signal_ledger');

const ROOT = process.cwd();
const MEMORY = path.join(ROOT, 'data/content_clusters/cluster_memory.json');
const COVERAGE = path.join(ROOT, 'data/query_coverage_map.json');
const SOCIAL_RUNS = path.join(ROOT, 'data/social/runs');
const REDDIT_QUERIES = path.join(ROOT, 'data/reddit/queries.json');
const CONVERSION_URL = 'https://aplayermode.com';
const CANONICAL_DOMAIN = 'https://billionairehighperformancecoach.com';
const AUDIENCES = ['professionals', 'entrepreneurs', 'athletes', 'moms/caregivers', 'multi-project operators'];

const MAX_STORED_SIGNALS = 50;
const MAX_CLUSTER_ID_LEN = 48;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general';
}

// Truncating a slug at a fixed byte offset cut words in half, and the cluster id
// is what titles are built from downstream. That is where the published
// whitepaper "State of A Simple Meeting Rule That Prevents Calendar Cha" came
// from: the source phrase ended "...Calendar Chaos" and the id was sliced at 48
// characters, mid-word. Cut back to the last complete word instead.
function truncateOnWordBoundary(value, limit) {
  const s = String(value || '');
  if (s.length <= limit) return s;
  const cut = s.slice(0, limit);
  const lastSep = cut.lastIndexOf('-');
  return (lastSep > 0 ? cut.slice(0, lastSep) : cut).replace(/-+$/, '');
}

function clusterId(text) {
  const v = String(text || '').toLowerCase();
  if (/discipline|consistency|follow through|habit/.test(v)) return 'discipline-consistency';
  if (/ai|chatgpt|assistant|automation|tool/.test(v)) return 'ai-executive-coaching';
  if (/burnout|overwhelmed|juggling|too much|multiple projects|decision fatigue/.test(v)) return 'burnout-overload-multi-track';
  if (/planning|daily plan|weekly review|priorit/.test(v)) return 'planning-review-systems';
  if (/coach|life coach|executive coach|accountability/.test(v)) return 'coaching-accountability';
  return truncateOnWordBoundary(slug(text), MAX_CLUSTER_ID_LEN) || 'general';
}

function intent(text) {
  const v = String(text || '').toLowerCase();
  if (/cost|price|worth|buy|download/.test(v)) return 'conversion';
  if (/best|compare|vs|tool|coach/.test(v)) return 'provider_selection';
  if (/how|system|framework|routine|plan/.test(v)) return 'process';
  if (/burnout|overwhelmed|stuck|fail/.test(v)) return 'pain';
  return 'general';
}

function loadSignals() {
  const out = [];
  if (fs.existsSync(SOCIAL_RUNS)) {
    for (const f of fs.readdirSync(SOCIAL_RUNS).filter((x) => x.endsWith('.json')).sort().slice(-14)) {
      const run = readJson(path.join(SOCIAL_RUNS, f), {});
      for (const r of run.records || []) {
        out.push({
          source: 'social',
          platform: r.platform,
          title: r.title || r.term || '',
          excerpt: r.excerpt || '',
          score: r.score || 0,
          captured_at: r.captured_at || run.generated_at,
        });
      }
    }
  }
  const reddit = readJson(REDDIT_QUERIES, { queries: [] });
  for (const q of reddit.queries || []) {
    out.push({
      source: 'reddit',
      platform: 'reddit',
      title: q.query || q.title || q.normalized_query || '',
      excerpt: q.answer || q.notes || '',
      score: q.score || 0,
      captured_at: q.captured_at,
    });
  }
  return out;
}

// The identity of an observation. Two rows with the same source, platform, text
// and capture time ARE the same observation seen twice, whether that is because
// the same run file was read again on the next pipeline run or because a
// collector emitted it twice into one file. Counting it once is the whole fix.
function signalKey(sig) {
  return [
    String(sig.source || 'unknown'),
    String(sig.platform || 'unknown'),
    String(sig.title || '').trim().toLowerCase(),
    String(sig.captured_at || ''),
  ].join('|');
}

function main() {
  const previous = readJson(MEMORY, { clusters: [], policy: {} });
  const prevMap = new Map((previous.clusters || []).map((c) => [c.cluster_id, c]));
  const signals = loadSignals();

  // Clusters written before this fix carry an inflated signal_count and no
  // signal_keys, and there is no record of WHICH observations produced that
  // number - only a total that was re-added on every run. The inflated figure
  // cannot be repaired into an honest one, so it is not carried forward: the
  // count is re-derived from the distinct observations actually on disk. That
  // is the honest observable floor. From this run on, keys accumulate, so the
  // history that was never recorded before is recorded from here.
  const migrated = [];
  for (const cluster of prevMap.values()) {
    if (!Array.isArray(cluster.signal_keys)) {
      migrated.push({ cluster_id: cluster.cluster_id, was: Number(cluster.signal_count || 0) });
      cluster.signal_keys = [];
      cluster.signal_count = 0;
      cluster.signals = [];
    }
  }

  const seenThisRun = new Map();
  for (const sig of signals) {
    const text = `${sig.title} ${sig.excerpt}`.trim();
    if (!text) continue;
    const id = clusterId(text);
    const existing = prevMap.get(id) || {
      cluster_id: id,
      signal_count: 0,
      signal_keys: [],
      signals: [],
      first_seen: new Date().toISOString(),
      status: 'emerging',
    };

    // Derived, never incremented. This is the line that used to be `+= 1`.
    // The ledger is shared with scripts/community/route_scored_signals.js, which
    // writes the same clusters under its own namespace; see scripts/lib/cluster_signal_ledger.js.
    const isNew = applySignalKeys(existing, 'observation', [signalKey(sig)], { maxScore: sig.score }) > 0;

    existing.intent_type = intent(text);
    existing.audiences = AUDIENCES.filter((a) =>
      new RegExp(a.split('/')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text));
    if (!existing.audiences.length) existing.audiences = AUDIENCES;

    // authority_potential, saturation, max_signal_score and authority_ready are
    // all derived inside applySignalKeys from the honest count, so nothing here
    // can set them independently of the ledger.
    existing.conversion_url = CONVERSION_URL;
    existing.canonical_domain = CANONICAL_DOMAIN;

    if (isNew) {
      existing.signals = [
        ...(existing.signals || []),
        { title: sig.title, source: sig.source, platform: sig.platform, captured_at: sig.captured_at },
      ].slice(-MAX_STORED_SIGNALS);
    }

    // last_updated moves only when the cluster actually learned something.
    // Stamping it every run made an unchanged file look freshly observed, and
    // produced a diff on every release for clusters where nothing happened.
    if (isNew) existing.last_updated = new Date().toISOString();
    if (!existing.last_updated) existing.last_updated = existing.first_seen;

    prevMap.set(id, existing);
    seenThisRun.set(id, (seenThisRun.get(id) || 0) + (isNew ? 1 : 0));
  }

  // A cluster with no distinct observation behind it is not a topic anyone has
  // raised; it is a leftover row. Two ways they appear: the re-derivation above
  // zeroes a cluster whose inflated count came entirely from re-counting, and
  // fixing the mid-word id truncation renames a cluster, leaving the old broken
  // id with nothing pointing at it. Either way, carrying it forward would keep a
  // stale authority_potential alive - `any-tips-...-at-w` sat at 69 with zero
  // signals - and that number is exactly what promotes a page. Drop them.
  const pruned = [];
  for (const [id, cluster] of [...prevMap.entries()]) {
    if (Number(cluster.signal_count || 0) > 0) continue;
    pruned.push({ cluster_id: id, stale_potential: Number(cluster.authority_potential || 0) });
    prevMap.delete(id);
  }

  const clusters = [...prevMap.values()].sort((a, b) =>
    (b.authority_potential || 0) - (a.authority_potential || 0) || String(a.cluster_id).localeCompare(String(b.cluster_id)));

  writeJson(MEMORY, {
    generated_at: previous.generated_at || new Date().toISOString(),
    count_basis: 'distinct_observation_keys',
    policy: previous.policy || {},
    clusters,
  });

  const coverage = readJson(COVERAGE, {});
  const covered = clusters.map((c) => ({
    cluster_id: c.cluster_id,
    intent_type: c.intent_type,
    signal_count: c.signal_count,
    saturation: c.saturation,
    canonical_anchor: (coverage.canonical_anchors || [])[0] || '/',
    conversion_url: CONVERSION_URL,
  }));
  const gaps = clusters
    .filter((c) => c.signal_count >= 5 && !String(c.status || '').includes('covered'))
    .map((c) => ({ cluster_id: c.cluster_id, reason: 'cluster has repeated demand but no confirmed synthesis/authority coverage' }));
  writeJson(COVERAGE, {
    ...coverage,
    generated_at: coverage.generated_at || new Date().toISOString(),
    covered_queries: covered,
    gaps: gaps.slice(0, 50),
  });

  const added = [...seenThisRun.values()].reduce((a, b) => a + b, 0);
  if (pruned.length) {
    const loud = pruned.filter((p) => p.stale_potential >= 40).map((p) => `${p.cluster_id} (was ${p.stale_potential})`);
    console.log(`content_clusters: pruned ${pruned.length} cluster(s) with zero distinct observations${loud.length ? `; ${loud.length} still carried a promotable score: ${loud.slice(0, 5).join(', ')}` : ''}`);
  }
  if (migrated.length) {
    const worst = migrated.sort((a, b) => b.was - a.was).slice(0, 3).map((m) => `${m.cluster_id} ${m.was}`).join(', ');
    console.log(`content_clusters: re-derived ${migrated.length} cluster(s) from distinct observations after the re-count defect (largest inflated counts: ${worst})`);
  }
  console.log(`content_clusters: tracked ${clusters.length} clusters from ${signals.length} signal rows; ${added} newly distinct this run`);
}

if (require.main === module) main();
