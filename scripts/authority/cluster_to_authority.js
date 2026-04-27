#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const MEMORY = path.join(ROOT, 'data/content_clusters/cluster_memory.json');
const QUEUE = path.join(ROOT, 'data/authority_paper_queue.json');
const ROUTING = path.join(ROOT, 'data/community/content_routing_log.json');
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
function promote({ minScore = 70, maxItems = 8 } = {}){
  const memory = read(MEMORY, { clusters: [] });
  const routing = read(ROUTING, { routes: [] });
  const queue = read(QUEUE, { items: [] });
  const existing = new Set((queue.items || []).map(i => i.cluster_id));
  const routes = Array.isArray(routing.routes) ? routing.routes : [];
  const created = [];
  for (const cluster of (memory.clusters || [])) {
    const clusterId = cluster.cluster_id;
    if (!clusterId || existing.has(clusterId)) continue;
    const authority_score = scoreCluster(cluster, routes);
    const isReady = cluster.authority_ready || authority_score >= minScore || Number(cluster.signal_count || 0) >= 25;
    if (!isReady) continue;
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
  queue.generated_at = new Date().toISOString();
  queue.policy = { trigger_based_authority: true, min_authority_score: minScore, max_promotions_per_run: maxItems, cta_target: CTA_TARGET };
  write(QUEUE, queue);
  return { queue, created };
}
if (require.main === module) {
  const result = promote();
  console.log(`cluster_to_authority: promoted ${result.created.length}; queue size ${result.queue.items.length}`);
}
module.exports = { promote };
