const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const BUILD_DIR = path.join(ROOT, '.build');
const SITEMAP_INDEX = path.join(ROOT, 'sitemap.xml');
const DEFAULT_PRIORITY_ROUTES = [
  '/',
  '/download.html',
  '/faq.html',
  '/atlas.html',
  '/answers/',
  '/comparisons/',
  '/coverage/',
  '/glossary.html',
  '/product.html',
  '/billionaire-high-performance-coach.html',
  '/how-to-build-a-coaching-system.html',
  '/ai-executive-coach.html',
  '/chatgpt-accountability-partner.html',
  '/ai-coach-vs-human-coach.html',
  '/chatgpt-vs-executive-coach.html',
  '/best-ai-coaching-tools.html'
];
const ALLOWED_HOSTS = new Set([
  'https://spryexecutiveos.com',
  'https://billionairehighperformancecoach.com'
]);

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function parseLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter(Boolean);
}

function unique(items) {
  return [...new Set(items)];
}

function routeOf(url) {
  const parsed = new URL(url);
  return parsed.pathname === '' ? '/' : parsed.pathname;
}

function hostOf(url) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

function findLocalFileForRoute(route) {
  const normalized = route === '/' ? '/index.html' : route;
  const htmlCandidate = path.join(ROOT, normalized.replace(/^\//, ''));
  const indexCandidate = path.join(ROOT, normalized.replace(/^\//, ''), 'index.html');
  if (fs.existsSync(htmlCandidate)) return htmlCandidate;
  if (fs.existsSync(indexCandidate)) return indexCandidate;
  return null;
}

function gatherChildSitemaps() {
  const childUrls = parseLocs(read(SITEMAP_INDEX));
  return childUrls.map((url) => {
    const filename = path.basename(new URL(url).pathname);
    return {
      url,
      filename,
      localPath: path.join(ROOT, filename),
    };
  }).filter((entry) => fs.existsSync(entry.localPath));
}

function selectHubUrls(batchUrls) {
  const candidates = [];
  for (const url of batchUrls) {
    const route = routeOf(url);
    if (route === '/') continue;
    if (/^\/insights\//.test(route)) continue;
    if (/^\/answers\/.+/.test(route) && route !== '/answers/') continue;
    if (/^\/comparisons\/.+/.test(route) && route !== '/comparisons/') continue;
    if (route.endsWith('.json') || route.endsWith('.xml') || route.endsWith('.txt')) continue;
    const depth = route.split('/').filter(Boolean).length;
    if (depth <= 2) candidates.push(url);
  }
  return unique(candidates).slice(0, 18);
}

function selectFeedUrls() {
  const feedPath = path.join(ROOT, 'feed.json');
  if (!fs.existsSync(feedPath)) return [];
  try {
    const feed = JSON.parse(read(feedPath));
    return unique((feed.items || []).map((item) => item.url).filter(Boolean)).slice(0, 10);
  } catch {
    return [];
  }
}

function buildPriorityUrls(batchUrls) {
  const batchSet = new Set(batchUrls);
  const selected = [];
  for (const route of DEFAULT_PRIORITY_ROUTES) {
    for (const host of ALLOWED_HOSTS) {
      const candidate = `${host}${route}`;
      if (batchSet.has(candidate)) selected.push(candidate);
    }
  }
  selected.push(...selectHubUrls(batchUrls));
  selected.push(...selectFeedUrls());
  const filtered = unique(selected).filter((url) => batchSet.has(url));
  return filtered.slice(0, 32);
}

function main() {
  if (!fs.existsSync(SITEMAP_INDEX)) {
    console.error('prepare_distribution_artifacts: missing sitemap.xml');
    process.exit(1);
  }
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  const childSitemaps = gatherChildSitemaps();
  if (!childSitemaps.length) {
    console.error('prepare_distribution_artifacts: no child sitemaps found');
    process.exit(1);
  }

  const batchUrls = unique(childSitemaps.flatMap((entry) => parseLocs(read(entry.localPath))));
  const priorityUrls = buildPriorityUrls(batchUrls);

  const files = {
    'indexnow-batch.txt': batchUrls,
    'indexnow-priority.txt': priorityUrls,
    'distribution-priority-urls.txt': priorityUrls,
  };

  for (const [filename, urls] of Object.entries(files)) {
    fs.writeFileSync(path.join(BUILD_DIR, filename), urls.join('\n') + '\n', 'utf8');
  }

  const readme = [
    'Option B-lite distribution artifacts for sprylabs-hpc-site-main.',
    '',
    `Generated child sitemaps: ${childSitemaps.map((item) => item.filename).join(', ')}`,
    `Priority URL count: ${priorityUrls.length}`,
    `Batch URL count: ${batchUrls.length}`,
    '',
    'Run distribution_scripts/deploy_distribution.sh after deploy.',
    'Manual Google Request Indexing remains limited to a small priority set.',
  ].join('\n');
  fs.writeFileSync(path.join(BUILD_DIR, 'distribution-readme.txt'), readme + '\n', 'utf8');

  const manifest = {
    generated_at: new Date().toISOString(),
    mode: 'option-b-lite',
    sitemap_index: 'sitemap.xml',
    child_sitemaps: childSitemaps.map((item) => item.filename),
    priority_count: priorityUrls.length,
    batch_count: batchUrls.length,
  };
  fs.writeFileSync(path.join(BUILD_DIR, 'distribution-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`prepare_distribution_artifacts: OK (${priorityUrls.length} priority urls, ${batchUrls.length} batch urls)`);
}

main();
