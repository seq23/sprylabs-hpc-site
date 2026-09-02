#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const MEMORY = path.join(ROOT, 'data/content_clusters/cluster_memory.json');
const QUEUE = path.join(ROOT, 'data/authority_paper_queue.json');
const ROUTING = path.join(ROOT, 'data/community/content_routing_log.json');
const STOP_REPORT = path.join(ROOT, 'artifacts/validation/authority-promotion-gate.json');
const { CTA_TARGET, AUTHORITY_DOMAIN } = require('../lib/audience_frame');
function read(file, fallback){ try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function write(file, data){ fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); }
function slug(s){ return String(s || 'authority').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'authority'; }
function titleFrom(id){ return String(id || 'authority').split(/[-_]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
function audienceCounts(routes, clusterId){
  const counts = {};
  for (const r of routes) if (r.cluster_id === clusterId && r.audience) counts[r.audience] = (counts[r.audience] || 0) + 1;
  return counts;
}
function evidenceLines(cluster){
  const signals = Array.isArray(cluster.signals) ? cluster.signals : [];
  return signals.slice(-12).map(s => ({ title: s.title || s.query || 'Observed execution-system query', source: s.source || 'unknown', platform: s.platform || s.subreddit || 'unknown', captured_at: s.captured_at || null }));
}
function scoreCluster(cluster, routes){
  const count = Number(cluster.signal_count || 0);
  const routeCount = routes.filter(r => r.cluster_id === cluster.cluster_id).length;
  const potential = Number(cluster.authority_potential || 0);
  const saturationBoost = cluster.saturation === 'authority_ready' ? 60 : cluster.saturation === 'saturated' ? 35 : cluster.saturation === 'rising' ? 15 : 0;
  return Math.max(potential, count * 2 + routeCount * 4 + saturationBoost);
}
// A score is not evidence on its own. Every whitepaper this lane published from
// a thin cluster looked "ready" by score while resting on a single observation
// repeated: "State of Coaching Accountability" was promoted at score 74 from ONE
// distinct signal seen 18 times, and its sibling from one signal whose text had
// been truncated mid-word ("...Calendar Cha"). The counting defect that inflated
// those scores is fixed in scripts/lib/cluster_signal_ledger.js, but a threshold
// that only ever reads a number will be fooled again by the next inflation bug.
//
// So promotion also requires a floor on DISTINCT observations, checked against
// the ledger rather than the derived count, and a cluster id that is a whole
// phrase rather than a truncated fragment. A cluster that clears the score but
// not the evidence floor is refused by name, not silently skipped.
const MIN_DISTINCT_SIGNALS = 12;

function distinctSignals(cluster){
  if (Array.isArray(cluster.signal_keys)) return new Set(cluster.signal_keys).size;
  // No ledger means the count is unverifiable, not that it is zero. Refuse.
  return null;
}

function looksTruncated(clusterId){
  // The id is built by slugging observed text and cutting it to a length. A cut
  // that lands mid-word yields a fragment that becomes a public page title.
  const tail = String(clusterId || '').split('-').pop() || '';
  return tail.length > 0 && tail.length <= 3 && /^[a-z]+$/.test(tail) && !['os','ai','vs','how','why','the','and','for','app','job','gap','win'].includes(tail);
}

function promote({ minScore = 70, maxItems = 8 } = {}){
  const memory = read(MEMORY, { clusters: [] });
  const routing = read(ROUTING, { routes: [] });
  const queue = read(QUEUE, { items: [] });
  const existing = new Set((queue.items || []).map(i => i.cluster_id));
  const routes = Array.isArray(routing.routes) ? routing.routes : [];
  const created = [];
  const refused = [];
  for (const cluster of (memory.clusters || [])) {
    const clusterId = cluster.cluster_id;
    if (!clusterId || existing.has(clusterId)) continue;
    const authority_score = scoreCluster(cluster, routes);
    const isReady = cluster.authority_ready || authority_score >= minScore || Number(cluster.signal_count || 0) >= 25;
    if (!isReady) continue;

    const distinct = distinctSignals(cluster);
    if (distinct === null) {
      refused.push({ cluster_id: clusterId, authority_score, reason: 'no signal_keys ledger, so the score cannot be traced to distinct observations' });
      continue;
    }
    if (distinct < MIN_DISTINCT_SIGNALS) {
      refused.push({ cluster_id: clusterId, authority_score, distinct_signals: distinct, reason: `only ${distinct} distinct observation(s), below the floor of ${MIN_DISTINCT_SIGNALS}; a score alone is not evidence` });
      continue;
    }
    if (looksTruncated(clusterId)) {
      refused.push({ cluster_id: clusterId, authority_score, reason: 'cluster id ends in a truncated word fragment and would become a mangled public page title' });
      continue;
    }
    const cleanSlug = `state-of-${slug(clusterId)}`;
    const audiences = audienceCounts(routes, clusterId);
    const primary_audience = Object.entries(audiences).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'executive';
    const item = {
      id: `authority_${slug(clusterId)}_${new Date().toISOString().slice(0,10)}`,
      cluster_id: clusterId,
      slug: cleanSlug,
      title: `State of ${titleFrom(clusterId)}: Execution Patterns, AI Coaching, and Accountability Demand`,
      description: `A signal-driven authority paper on ${titleFrom(clusterId).toLowerCase()} built from repeated audience questions, routing data, and cluster maturity.`,
      status: 'queued',
      authority_score,
      promotion_reason: authority_score >= minScore ? 'authority score threshold met' : 'cluster signal density threshold met',
      primary_audience,
      audiences,
      signal_count: Number(cluster.signal_count || 0),
      saturation: cluster.saturation || 'emerging',
      evidence: evidenceLines(cluster),
      canonical_target: `${AUTHORITY_DOMAIN}/whitepapers/${cleanSlug}.html`,
      cta_target: CTA_TARGET,
      created_at: new Date().toISOString()
    };
    queue.items.push(item);
    existing.add(clusterId);
    created.push(item);
    if (created.length >= maxItems) break;
  }
  if (created.length) queue.generated_at = new Date().toISOString();
  else if (!queue.generated_at) queue.generated_at = new Date().toISOString();
  queue.policy = { trigger_based_authority: true, min_authority_score: minScore, min_distinct_signals: MIN_DISTINCT_SIGNALS, max_promotions_per_run: maxItems, cta_target: CTA_TARGET };
  write(QUEUE, queue);

  // Rule 0: this lane may legitimately promote nothing - most days it should -
  // but it may not do that in silence. Promoting zero because no cluster has
  // earned it is a NAMED STOP and is a green, correct outcome; promoting zero
  // because the memory file vanished is not, and these two used to be
  // indistinguishable from the outside. The artifact says which.
  const considered = (memory.clusters || []).filter((c) => c.cluster_id && !existing.has(c.cluster_id)).length;
  const stop = created.length
    ? null
    : considered === 0
      ? { code: 'NO_UNQUEUED_CLUSTERS', message: `Every one of the ${(memory.clusters || []).length} tracked cluster(s) is already in the authority queue. Nothing to promote.` }
      : refused.length
        ? { code: 'NO_CLUSTER_CLEARED_THE_EVIDENCE_FLOOR', message: `${considered} unqueued cluster(s) considered; ${refused.length} scored high enough but were refused for want of evidence (e.g. ${refused[0].cluster_id}: ${refused[0].reason}). Publishing them is what produced the retired "State of ..." papers.` }
        : { code: 'NO_CLUSTER_REACHED_THE_SCORE', message: `${considered} unqueued cluster(s) considered, none reached authority score ${minScore}, ${MIN_DISTINCT_SIGNALS} distinct signals, or authority_ready. This is the expected daily outcome.` };

  write(STOP_REPORT, {
    generated_at: new Date().toISOString(),
    lane: 'authority-promotion',
    status: created.length ? 'PASS' : 'NAMED_STOP',
    clusters_tracked: (memory.clusters || []).length,
    clusters_considered: considered,
    promoted_count: created.length,
    promoted: created.map((c) => ({ cluster_id: c.cluster_id, slug: c.slug, authority_score: c.authority_score })),
    refused_count: refused.length,
    refused,
    min_authority_score: minScore,
    min_distinct_signals: MIN_DISTINCT_SIGNALS,
    outcome: created.length ? { code: 'PROMOTED', message: `${created.length} cluster(s) cleared both the score and the distinct-evidence floor.` } : null,
    stop_reason: stop,
  });

  return { queue, created, refused, stop };
}
if (require.main === module) {
  const result = promote();
  const detail = result.stop ? ` — STOP ${result.stop.code}: ${result.stop.message}` : '';
  console.log(`cluster_to_authority: promoted ${result.created.length}; refused ${result.refused.length}; queue size ${result.queue.items.length}${detail}`);
}
module.exports = { promote };
