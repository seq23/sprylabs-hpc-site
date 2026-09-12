/**
 * ONE derivation of data/query_coverage_map.json from the cluster ledger.
 *
 * ─── THE DEFECT ────────────────────────────────────────────────────────────
 *
 * `cluster_memory.json` HAS TWO WRITERS, and only one of them knew about the
 * coverage map:
 *
 *   scripts/authority/update_content_clusters.js  writes MEMORY, then derives
 *                                                 COVERAGE from the same list.
 *   scripts/community/route_scored_signals.js     runs AFTER it and OVERWRITES
 *                                                 MEMORY with its own view.
 *
 * So every run ended with a memory file the coverage map had never seen. The
 * coverage map was always exactly ONE PASS BEHIND: pass 1 projected the first
 * writer's clusters, pass 2 projected what the second writer had left behind,
 * and only then did it settle.
 *
 * validate:cluster-signal-integrity asserts that re-running both writers on
 * unchanged inputs changes nothing - the property whose absence let signal_count
 * climb until every tracked cluster published a whitepaper on a timer. A file that
 * needs two passes fails that check forever, and it took Spry Content Release red
 * on 2026-09-12 at the self-heal stage, which correctly reported "nothing
 * repairable - these need a decision, not another attempt".
 *
 * It was never a re-count. It was two writers and one projection, which is the
 * same shape the counter defect had.
 *
 * ─── THE RULE ──────────────────────────────────────────────────────────────
 *
 * The projection lives here, and BOTH writers call it against the memory they
 * have just written. The one that runs last therefore leaves a coverage map that
 * matches the memory that actually persisted, and one pass converges.
 *
 * Kept as a function of (clusters, previousCoverage) with no I/O of its own so
 * there is nothing to keep in sync: a second copy of this arithmetic is exactly
 * what produced the lag.
 */
'use strict';

const CONVERSION_URL = 'https://aplayermode.com';

/** The coverage document for a cluster ledger. Pure - callers own the file. */
function deriveQueryCoverage(clusters, previousCoverage = {}) {
  const list = Array.isArray(clusters) ? clusters : [];
  const covered = list.map((c) => ({
    cluster_id: c.cluster_id,
    intent_type: c.intent_type,
    signal_count: c.signal_count,
    saturation: c.saturation,
    canonical_anchor: (previousCoverage.canonical_anchors || [])[0] || '/',
    conversion_url: CONVERSION_URL,
  }));
  const gaps = list
    .filter((c) => Number(c.signal_count) >= 5 && !String(c.status || '').includes('covered'))
    .map((c) => ({ cluster_id: c.cluster_id, reason: 'cluster has repeated demand but no confirmed synthesis/authority coverage' }));
  return {
    ...previousCoverage,
    generated_at: previousCoverage.generated_at || new Date().toISOString(),
    covered_queries: covered,
    gaps: gaps.slice(0, 50),
  };
}

module.exports = { deriveQueryCoverage, CONVERSION_URL };
