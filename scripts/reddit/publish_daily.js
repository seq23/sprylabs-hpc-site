
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const queue = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/reddit/publish_queue.json'), 'utf8'));
const publishedPath = path.join(ROOT, 'data/reddit/published_manifest.json');
const slugRegistryPath = path.join(ROOT, 'data/reddit/slug_registry.json');
const clusterRegistryPath = path.join(ROOT, 'data/reddit/cluster_registry.json');
const archivePath = path.join(ROOT, 'data/reddit/archive', `${new Date().toISOString().slice(0,10)}-publish.json`);

function readJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  return JSON.parse(fs.readFileSync(pathname, 'utf8'));
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = item[key];
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function main() {
  const published = readJson(publishedPath, { generated_at: null, items: [] });
  const slugRegistry = readJson(slugRegistryPath, { generated_at: null, slugs: [] });
  const clusterRegistry = readJson(clusterRegistryPath, { generated_at: null, clusters: [] });
  const publishedNow = [];

  for (const item of (queue.items || [])) {
    const targetPath = path.join(ROOT, item.target_file);
    if (!fs.existsSync(targetPath)) throw new Error(`publish_daily: missing generated file ${item.target_file}`);
    if (!published.items.find((entry) => entry.slug === item.slug)) {
      const payload = {
        slug: item.slug,
        route: item.route,
        title: item.title,
        page_type: item.page_type,
        canonical_host: item.canonical_host,
        target_file: item.target_file,
        required_links: item.required_links,
        cluster_id: item.cluster_id,
        cluster_label: item.cluster_label,
        published_at: new Date().toISOString(),
        source_count: item.source_count,
        supporting_sources: item.supporting_sources
      };
      published.items.push(payload);
      publishedNow.push(payload);
      slugRegistry.slugs.push({ slug: item.slug, route: item.route, target_file: item.target_file, cluster_id: item.cluster_id, published_at: payload.published_at });
      clusterRegistry.clusters.push({ cluster_id: item.cluster_id, slug: item.slug, route: item.route, published_at: payload.published_at });
    }
  }

  published.generated_at = new Date().toISOString();
  slugRegistry.generated_at = published.generated_at;
  clusterRegistry.generated_at = published.generated_at;
  published.items = uniqueBy(published.items, 'slug');
  slugRegistry.slugs = uniqueBy(slugRegistry.slugs, 'slug');
  clusterRegistry.clusters = uniqueBy(clusterRegistry.clusters, 'slug');
  fs.writeFileSync(publishedPath, JSON.stringify(published, null, 2));
  fs.writeFileSync(slugRegistryPath, JSON.stringify(slugRegistry, null, 2));
  fs.writeFileSync(clusterRegistryPath, JSON.stringify(clusterRegistry, null, 2));
  fs.writeFileSync(archivePath, JSON.stringify({ generated_at: new Date().toISOString(), items: publishedNow }, null, 2));
  console.log(`publish_daily: published ${publishedNow.length} page(s)`);
}

main();
