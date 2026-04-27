
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const publishedPath = path.join(ROOT, 'data/reddit/published_manifest.json');
const slugRegistryPath = path.join(ROOT, 'data/reddit/slug_registry.json');
const clusterRegistryPath = path.join(ROOT, 'data/reddit/cluster_registry.json');
const errors = [];

function read(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  return JSON.parse(fs.readFileSync(pathname, 'utf8'));
}

function assertUnique(items, key, label) {
  const seen = new Set();
  for (const item of items) {
    const value = item[key];
    if (!value) continue;
    if (seen.has(value)) errors.push(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

const published = read(publishedPath, { items: [] });
const slugRegistry = read(slugRegistryPath, { slugs: [] });
const clusterRegistry = read(clusterRegistryPath, { clusters: [] });
assertUnique(published.items || [], 'slug', 'published slug');
assertUnique(published.items || [], 'route', 'published route');
assertUnique(slugRegistry.slugs || [], 'slug', 'slug registry slug');
assertUnique(clusterRegistry.clusters || [], 'slug', 'cluster registry slug');

for (const item of (published.items || [])) {
  if (!(slugRegistry.slugs || []).find((entry) => entry.slug === item.slug)) errors.push(`Missing slug registry entry for ${item.slug}`);
  if (!(clusterRegistry.clusters || []).find((entry) => entry.slug === item.slug && entry.cluster_id === item.cluster_id)) errors.push(`Missing cluster registry entry for ${item.slug}`);
}

if (errors.length) {
  console.error('validate_reddit_uniqueness failed');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`validate_reddit_uniqueness: OK (${(published.items || []).length} published pages checked)`);

process.exit(0);
