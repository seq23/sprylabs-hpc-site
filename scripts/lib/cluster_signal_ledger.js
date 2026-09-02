'use strict';

// One ledger of distinct observations per content cluster.
//
// `signal_count` on a cluster decides whether that cluster becomes a published
// whitepaper (scripts/authority/cluster_to_authority.js promotes at
// authority_potential >= 70, and authority_potential is signal_count * 3). Two
// separate scripts used to maintain that field, each with its own private
// running total and no shared notion of which observations had already been
// counted:
//
//   scripts/authority/update_content_clusters.js   existing.signal_count += 1
//   scripts/community/route_scored_signals.js      old.signal_count + c.signal_count
//
// Both run in `npm run content:pipeline`, route:signals second. Neither
// deduplicated, so each re-added the same unchanged source rows on every run and
// the second overwrote whatever the first had concluded. Counts climbed forever
// on no new information - ai-executive-coaching reached 9,837 from 41 distinct
// observations, discipline-consistency 2,322 from 3 - until clusters crossed the
// promotion threshold on a timer and published whitepapers nobody had asked for.
// Fixing one writer alone does not hold, because the other one overwrites it.
//
// So there is one list, and both writers add to it. Keys are namespaced by
// writer, the count is the size of the union, and adding a key that is already
// present is a no-op. Re-running either script, in either order, any number of
// times, on unchanged inputs converges to the same numbers.

const MAX_TRACKED_KEYS = 20000;

function namespacedKey(namespace, key) {
  return `${namespace}|${String(key)}`;
}

// Adds `keys` to the cluster's ledger under `namespace` and re-derives every
// number that hangs off the count. Returns how many were genuinely new.
function applySignalKeys(cluster, namespace, keys, { maxScore = 0 } = {}) {
  const ledger = new Set(Array.isArray(cluster.signal_keys) ? cluster.signal_keys : []);
  const before = ledger.size;
  for (const k of keys) {
    if (k === undefined || k === null || k === '') continue;
    ledger.add(namespacedKey(namespace, k));
  }
  // Sorted so the serialized file does not churn on set-iteration order.
  cluster.signal_keys = [...ledger].sort().slice(-MAX_TRACKED_KEYS);
  cluster.signal_count = cluster.signal_keys.length;
  cluster.count_basis = 'distinct_signal_keys';

  const best = Math.max(Number(cluster.max_signal_score || 0), Number(maxScore || 0));
  cluster.max_signal_score = best;
  cluster.authority_potential = Math.min(100, Math.round(cluster.signal_count * 3 + best / 2));
  cluster.saturation = saturationFor(cluster.signal_count);
  // authority_ready is a promotion trigger in cluster_to_authority.js, so it has
  // to be derived from the honest count too, never left set by a prior run.
  cluster.authority_ready = cluster.signal_count >= 150 || cluster.saturation === 'authority_ready';
  return cluster.signal_keys.length - before;
}

function saturationFor(count) {
  if (count >= 300) return 'authority_ready';
  if (count >= 50) return 'saturated';
  if (count >= 20) return 'rising';
  return 'emerging';
}

// True when the cluster's numbers are consistent with its ledger. The guard
// (scripts/validators/validate_cluster_signal_integrity.mjs) uses this so a
// future writer that sets signal_count by hand is caught rather than trusted.
function ledgerIsConsistent(cluster) {
  const keys = Array.isArray(cluster.signal_keys) ? cluster.signal_keys : null;
  if (!keys) return { ok: false, reason: 'no signal_keys ledger; signal_count cannot be verified against anything' };
  if (new Set(keys).size !== keys.length) return { ok: false, reason: 'signal_keys contains duplicates' };
  if (Number(cluster.signal_count) !== keys.length) {
    return { ok: false, reason: `signal_count ${cluster.signal_count} does not equal the ${keys.length} distinct key(s) in the ledger` };
  }
  if (cluster.saturation !== saturationFor(keys.length)) {
    return { ok: false, reason: `saturation "${cluster.saturation}" does not match the ${keys.length} distinct signal(s)` };
  }
  return { ok: true };
}

module.exports = { applySignalKeys, ledgerIsConsistent, saturationFor, MAX_TRACKED_KEYS };
