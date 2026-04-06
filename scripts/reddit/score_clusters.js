
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const IN_DIR = path.join(ROOT, 'data/reddit/clusters');
const RULES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/reddit/cluster_rules.json'), 'utf8'));
const SLUG_REGISTRY_PATH = path.join(ROOT, 'data/reddit/slug_registry.json');
const PUBLISHED_MANIFEST_PATH = path.join(ROOT, 'data/reddit/published_manifest.json');

function latestFile(dir) {
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json')).sort();
  if (!files.length) throw new Error(`No files in ${dir}`);
  return files[files.length - 1];
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function existingSlugs() {
  const slugs = new Set();
  for (const file of fs.readdirSync(ROOT)) {
    if (file.endsWith('.html')) slugs.add(file.replace(/\.html$/, ''));
  }
  if (fs.existsSync(SLUG_REGISTRY_PATH)) {
    const registry = JSON.parse(fs.readFileSync(SLUG_REGISTRY_PATH, 'utf8'));
    for (const item of (registry.slugs || [])) slugs.add(item.slug);
  }
  if (fs.existsSync(PUBLISHED_MANIFEST_PATH)) {
    const manifest = JSON.parse(fs.readFileSync(PUBLISHED_MANIFEST_PATH, 'utf8'));
    for (const item of (manifest.items || [])) slugs.add(item.slug);
  }
  return slugs;
}

function scoreCluster(cluster) {
  const weights = RULES.weights;
  const recurrence = Math.min(100, cluster.size * 25);
  const freshness = 80;
  const commercialFit = Math.round(cluster.items.reduce((acc, item) => acc + Number(item.commercial_signal || 0), 0) / Math.max(cluster.items.length, 1));
  const extractability = Math.round(cluster.items.reduce((acc, item) => acc + Number(item.extractability_score || 0), 0) / Math.max(cluster.items.length, 1));
  const uniqueness = cluster.size === 1 ? 82 : 72;
  const evidenceDensity = Math.min(100, cluster.evidence_count * 10);
  const coverageGap = 90;
  const numerator = recurrence * weights.recurrence + freshness * weights.freshness + commercialFit * weights.commercial_fit + extractability * weights.extractability + uniqueness * weights.uniqueness + evidenceDensity * weights.evidence_density + coverageGap * weights.coverage_gap;
  const denominator = Object.values(weights).reduce((acc, value) => acc + value, 0);
  return Math.round(numerator / denominator);
}

function buildQueueItem(cluster) {
  const config = RULES.clusters[cluster.cluster_id] || {};
  const slug = slugify(config.slug || `${cluster.cluster_id}-${cluster.recommended_page_type}`);
  const host = config.default_host === 'bhpc' ? 'https://billionairehighperformancecoach.com' : 'https://spryexecutiveos.com';
  const route = `/${slug}.html`;
  const title = cluster.recommended_page_type === 'roundup'
    ? `What Reddit Keeps Asking About ${config.label || cluster.label}`
    : cluster.recommended_page_type === 'pattern'
      ? `Why Reddit Users ${config.label || cluster.label}`
      : `How ${config.label || cluster.label}`;
  const publishReason = `Cluster ${cluster.cluster_id} has ${cluster.size} source item(s) across ${cluster.unique_subreddits.length || 1} subreddit(s) and clears the publish threshold.`;
  return {
    cluster_id: cluster.cluster_id,
    page_type: cluster.recommended_page_type,
    slug,
    title,
    route,
    canonical_host: host,
    target_file: `${slug}.html`,
    publish_reason: publishReason,
    source_count: cluster.size,
    supporting_sources: cluster.items.slice(0, 5).map((item) => ({ subreddit: item.subreddit, permalink: item.permalink, title: item.title, created_at: item.created_at })),
    required_links: [config.cta_link || '/download.html', config.hub_link || '/answers/', config.pillar_link || '/models/', config.related_link || '/ai-executive-coach.html'],
    cluster_label: config.label || cluster.label,
    score: scoreCluster(cluster),
    cluster
  };
}

function main() {
  const file = latestFile(IN_DIR);
  const input = JSON.parse(fs.readFileSync(path.join(IN_DIR, file), 'utf8'));
  const usedSlugs = existingSlugs();
  const queue = [];
  for (const cluster of (input.clusters || [])) {
    if (cluster.size < (RULES.min_cluster_size || 1)) continue;
    const item = buildQueueItem(cluster);
    if (usedSlugs.has(item.slug)) continue;
    if (item.score < RULES.publish_threshold) continue;
    queue.push(item);
  }
  queue.sort((a, b) => b.score - a.score);
  const output = { generated_at: new Date().toISOString(), items: queue.slice(0, RULES.max_daily_pages) };
  fs.writeFileSync(path.join(ROOT, 'data/reddit/publish_queue.json'), JSON.stringify(output, null, 2));
  console.log(`score_clusters: queued ${output.items.length} items`);
}

main();
