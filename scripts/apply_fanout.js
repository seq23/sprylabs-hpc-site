const fs = require('fs');
const path = require('path');
const { classifyPageFamily, buildFanoutData, renderFanoutBlock } = require('./fanout/shared');

const ROOT = process.cwd();
const EXCLUDE_DIRS = new Set(['.pages-output', 'node_modules', '.git', '_ops', 'scripts', 'data', '.github', 'audit', '.build', 'releases', 'docs', 'templates']);
const manifests = [];
const missing = [];
const duplicates = [];
const variantOwners = new Map();

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.html')) processFile(full);
  }
}

function replaceExistingFanout(html, block) {
  if (!html.includes('data-fanout-query-cluster="true"')) return null;
  return html.replace(/\n<section class="fanout-block[\s\S]*?<\/section>\n?/i, block);
}

function insertFanout(html, block) {
  const mainClose = html.match(/<\/main>/i);
  if (mainClose) return html.replace(/<\/main>/i, `${block}</main>`);
  const bodyClose = html.match(/<\/body>/i);
  if (bodyClose) return html.replace(/<\/body>/i, `${block}</body>`);
  return null;
}

function processFile(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const family = classifyPageFamily(rel);
  if (family === 'ignore' || family === 'coverage') return;
  let html = fs.readFileSync(file, 'utf8');
  const data = buildFanoutData(rel, html);
  if (!data.variants.length) {
    missing.push({ file: rel, reason: 'no variants' });
    return;
  }
  for (const variant of data.variants) {
    const key = variant.toLowerCase();
    const owners = variantOwners.get(key) || [];
    owners.push(rel);
    variantOwners.set(key, owners);
  }
  const block = renderFanoutBlock(data);
  const updated = replaceExistingFanout(html, block) || insertFanout(html, block);
  if (!updated) {
    missing.push({ file: rel, reason: 'no insertion point' });
    return;
  }
  fs.writeFileSync(file, updated);
  manifests.push({ file: rel, ...data });
}

walk(ROOT);

for (const [variant, owners] of variantOwners.entries()) {
  if (owners.length > 3) duplicates.push({ variant, owners });
}

fs.mkdirSync(path.join(ROOT, '.build'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'releases'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.build/fanout_manifest.json'), JSON.stringify(manifests, null, 2));
fs.writeFileSync(path.join(ROOT, '.build/fanout_missing.json'), JSON.stringify(missing, null, 2));
fs.writeFileSync(path.join(ROOT, '.build/fanout_duplicates.json'), JSON.stringify(duplicates, null, 2));
fs.writeFileSync(
  path.join(ROOT, 'data/releases/fanout_query_clusters.bhpc.json'),
  JSON.stringify({ generated_at: new Date().toISOString(), page_count: manifests.length, pages: manifests }, null, 2)
);

console.log(`apply_fanout: processed ${manifests.length} html files`);
console.log(`apply_fanout: missing ${missing.length}`);
console.log(`apply_fanout: duplicate variants ${duplicates.length}`);
