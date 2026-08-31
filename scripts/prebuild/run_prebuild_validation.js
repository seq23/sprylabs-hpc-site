#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
// The shared boundary, not a private list. See scripts/lib/repo_walk.cjs.
//
// This file was named as one of the repo's root-recursive writers, and it was
// not one: it read the repository root with a single flat readdirSync and never
// descended, so it could not reach a `.claude/worktrees/<id>` checkout. The
// guard matched it on a recursion pattern it does not actually have.
//
// The flat read was a different defect. existingSlugs is what duplicateRisk is
// measured against - "does a page for this query already exist" - and only 163
// of this repo's 2,295 pages sit at the root. The other 2,132 live under
// answers/, use-cases/, vs/, glossary/ and so on, so the duplicate check was
// blind to 93% of the library and a cluster duplicating an existing answers/
// page came back duplicateRisk: false. Making the scan see the whole library is
// what this check was always asking for - and doing it through the shared
// boundary is what keeps the newly-recursive walk out of another agent's
// checkout, rather than turning a false positive into a real one.
const { walkFiles } = require('../lib/repo_walk.cjs');
const ROOT = process.cwd();
const clustersPath = path.join(ROOT, 'data/clusters/clusters.json');
const approvedPath = path.join(ROOT, 'data/clusters/approved_clusters.json');
const rejectedPath = path.join(ROOT, 'data/clusters/rejected_clusters.json');
const redditQueuePath = path.join(ROOT, 'data/reddit/publish_queue.json');
function readJson(file, fallback) { try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; } catch { return fallback; } }
function writeJson(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); }
function slug(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96); }
const existingSlugs = new Set();
for (const rel of walkFiles(ROOT, { filter: (p) => p.endsWith('.html') })) {
  existingSlugs.add(path.basename(rel).replace(/\.html$/, ''));
}
const published = readJson(path.join(ROOT, 'data/reddit/published_manifest.json'), { items: [] });
for (const item of (published.items || [])) if (item.slug) existingSlugs.add(item.slug);
const badPatterns = [/About Press Copyright/i, /Google LLC/i, /YouTube works Test new features/i, /Terms Privacy Policy/i, /NFL Sunday Ticket/i];
function quality(cluster) {
  const reasons = [];
  const queries = cluster.queries || [];
  const text = `${cluster.label || ''} ${queries.join(' ')}`;
  if (badPatterns.some(rx => rx.test(text))) reasons.push('junk_boilerplate_detected');
  if ((cluster.query_count || queries.length) < 1) reasons.push('no_queries');
  if ((cluster.size || 0) < 1) reasons.push('empty_cluster');
  const wordTotal = queries.join(' ').split(/\s+/).filter(Boolean).length;
  if (wordTotal < 4) reasons.push('insufficient_wordcount_feasibility');
  const hasRoute = /accountability|coach|planning|decision|consistency|system|comparison|overplanning|minimum|founder|workflow|ai|executive|productivity/i.test(text);
  if (!hasRoute) reasons.push('no_clear_site_relevance');
  const duplicateRisk = queries.some(q => existingSlugs.has(slug(q)));
  return { passed: reasons.length === 0, reasons, duplicateRisk };
}
const clusters = readJson(clustersPath, { clusters: [] }).clusters || [];
const approved = [];
const rejected = [];
for (const cluster of clusters) {
  const result = quality(cluster);
  const enriched = { ...cluster, prebuild: result };
  if (result.passed) approved.push(enriched); else rejected.push(enriched);
}
writeJson(approvedPath, { generated_at: new Date().toISOString(), count: approved.length, clusters: approved });
writeJson(rejectedPath, { generated_at: new Date().toISOString(), count: rejected.length, clusters: rejected });

if (fs.existsSync(redditQueuePath)) {
  const queue = readJson(redditQueuePath, { items: [] });
  const filtered = [];
  const queueRejected = [];
  const seenClusters = new Set((published.items || []).map(i => i.cluster_id || i.cluster).filter(Boolean));
  for (const item of (queue.items || [])) {
    const text = `${item.title || ''} ${item.cluster_label || ''} ${item.slug || ''}`;
    const reasons = [];
    if (badPatterns.some(rx => rx.test(text))) reasons.push('junk_boilerplate_detected');
    if (seenClusters.has(item.cluster_id)) reasons.push('cluster_already_published');
    if (!item.required_links || item.required_links.length < 2) reasons.push('weak_internal_link_plan');
    if (!item.route || !item.target_file) reasons.push('missing_route_or_target_file');
    if (reasons.length) queueRejected.push({ ...item, rejected_reasons: reasons });
    else filtered.push(item);
  }
  writeJson(redditQueuePath, { ...queue, prevalidated_at: new Date().toISOString(), items: filtered, rejected_items: queueRejected });
  console.log(`prebuild: filtered reddit publish queue ${filtered.length}/${(queue.items || []).length}`);
}
console.log(`prebuild: approved ${approved.length}; rejected ${rejected.length}`);
if (approved.length === 0 && clusters.length > 0) {
  console.error('prebuild: no approved clusters from non-empty input');
  process.exit(1);
}
