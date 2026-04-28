#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'data/ingestion/normalized');
const RAW_DIR = path.join(ROOT, 'data/ingestion/raw');
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

const badPatterns = [
  /About Press Copyright/i,
  /Google LLC/i,
  /YouTube works Test new features/i,
  /NFL Sunday Ticket/i,
  /Terms Privacy Policy/i,
  /^\s*$/
];

function readJson(file, fallback) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; }
  catch (e) { return fallback; }
}

function cleanText(value) {
  return String(value || '')
    .replace(/&copy;|©/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugish(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96);
}

const sources = [];
function push(item, sourceType, sourceFile) {
  const query = cleanText(item.query || item.normalized_question || item.title || item.canonical_question || item.cluster_label || item.slug || '');
  const body = cleanText(item.body || item.excerpt || item.summary || item.description || '');
  const text = cleanText(`${query} ${body}`);
  if (!query || query.split(/\s+/).length < 2) return;
  if (badPatterns.some(rx => rx.test(text))) return;
  const key = slugish(`${sourceType}-${query}`);
  sources.push({
    id: item.id || key,
    source: sourceType,
    source_file: sourceFile,
    query,
    text,
    normalized_text: cleanText(query.toLowerCase()),
    title: cleanText(item.title || query),
    url: item.permalink || item.url || item.route || '',
    route: item.route || '',
    cluster_hint: item.cluster_id || item.cluster || item.pillar || item.category || '',
    intent: item.intent || item.page_type || 'question',
    commercial_signal: Number(item.commercial_signal || item.score || 0),
    extractability_score: Number(item.extractability_score || 0),
    created_at: item.created_at || item.published_at || item.generated_at || new Date().toISOString()
  });
}

const redditQueries = readJson(path.join(ROOT, 'data/reddit/queries.json'), {});
for (const item of (redditQueries.items || redditQueries.queries || [])) push(item, 'reddit', 'data/reddit/queries.json');

const generatedPages = readJson(path.join(ROOT, 'data/reddit/generated_pages.json'), []);
for (const item of generatedPages) push(item, 'reddit_generated_page', 'data/reddit/generated_pages.json');

const publishedManifest = readJson(path.join(ROOT, 'data/reddit/published_manifest.json'), {});
for (const item of (publishedManifest.items || [])) push(item, 'published_manifest', 'data/reddit/published_manifest.json');

const socialDir = path.join(ROOT, 'data/social/runs');
if (fs.existsSync(socialDir)) {
  for (const file of fs.readdirSync(socialDir).filter(f => f.endsWith('.json')).sort()) {
    const data = readJson(path.join(socialDir, file), {});
    for (const item of (data.items || data.records || data.signals || [])) push(item, 'social', `data/social/runs/${file}`);
  }
}

const insightClusters = readJson(path.join(ROOT, 'content/insights/_clusters.json'), []);
for (const item of insightClusters) push({ ...item, query: item.name || item.id, body: item.description || item.atlas_take, cluster_id: item.id }, 'insight_cluster', 'content/insights/_clusters.json');

const queryMetadata = readJson(path.join(ROOT, 'data/query_metadata.json'), {});
for (const item of (queryMetadata.items || [])) push(item, 'query_metadata', 'data/query_metadata.json');

const seen = new Set();
const unified = [];
for (const item of sources) {
  const key = slugish(`${item.normalized_text}-${item.cluster_hint}`);
  if (seen.has(key)) continue;
  seen.add(key);
  unified.push(item);
}

const output = { generated_at: new Date().toISOString(), count: unified.length, items: unified };
fs.writeFileSync(path.join(OUT_DIR, 'unified_stream.json'), JSON.stringify(output, null, 2) + '\n');
fs.writeFileSync(path.join(RAW_DIR, 'last_ingestion_manifest.json'), JSON.stringify({ generated_at: output.generated_at, source_count: sources.length, normalized_count: unified.length }, null, 2) + '\n');
console.log(`normalize_all_sources: wrote ${unified.length} normalized signals`);
