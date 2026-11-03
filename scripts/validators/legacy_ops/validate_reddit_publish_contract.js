const fs = require('fs');
const path = require('path');
const {isRetiredFile} = require('../../lib/spry_rescue.cjs');
const {spryRescueResponse} = require('../../../functions/_lib/spry_rescue.js');
const {consolidationResponse} = require('../../../functions/_lib/host_consolidation.js');
const rescueLedger = require('../../../data/seo/spry_rescue_redirects.json').redirects;

const ROOT = process.cwd();
const publishedPath = path.join(ROOT, 'data/reddit/published_manifest.json');
const sitemapPath = path.join(ROOT, 'sitemap-spry.xml');
// The full index, not the orientation file. Since Search Readiness a7 llms.txt
// is a ~292-word orientation file capped at 2,000 words and llms-full.txt
// carries every page; requiring a published page here would have asked the
// whole index back into the file the cap exists to keep small. Same move as
// validate_citation_contract.py, citation:warn and validate:llms-full-coverage.
const llmsPath = path.join(ROOT, 'llms-full.txt');
const coveragePath = path.join(ROOT, 'knowledge-map/knowledge-map.json');

if (!fs.existsSync(publishedPath)) {
  console.error('validate_reddit_publish_contract: missing historical publication manifest');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(publishedPath, 'utf8'));
const sitemap = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, 'utf8') : '';
const llms = fs.existsSync(llmsPath) ? fs.readFileSync(llmsPath, 'utf8') : '';
const coverage = fs.existsSync(coveragePath) ? JSON.parse(fs.readFileSync(coveragePath, 'utf8')) : {};
const errors = [];

function extractTagValue(html, tagName, keyName, keyValue, valueAttr) {
  const re = new RegExp(
    `<${tagName}[^>]*${keyName}=["']${keyValue}["'][^>]*${valueAttr}=["']([^"']*)["'][^>]*>|<${tagName}[^>]*${valueAttr}=["']([^"']*)["'][^>]*${keyName}=["']${keyValue}["'][^>]*>`,
    'is'
  );
  const match = html.match(re);
  return match ? (match[1] || match[2] || '') : '';
}

function htmlHasAnyHeading(html, headings) {
  return headings.some((heading) => html.includes(`<h2>${heading}</h2>`) || html.includes(`<h3>${heading}</h3>`));
}

function buildCoverageRouteSet(coverageObj) {
  const set = new Set();
  const rv = ((coverageObj || {}).redditVelocity || {});
  const candidates = [rv.latestRoutes, rv.routes, coverageObj.latestRoutes, coverageObj.routes];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const item of candidate) {
      if (typeof item === 'string') set.add(item);
      if (item && typeof item === 'object' && typeof item.route === 'string') set.add(item.route);
    }
  }

  return set;
}

const coverageRoutes = buildCoverageRouteSet(coverage);
const items = Array.isArray(manifest.items) ? manifest.items : [];

if (!items.length) errors.push('published manifest contains zero publications to examine');
let retired = 0;
for (const item of items) {
  const source = item.target_file || `${item.slug}.html`;
  if (isRetiredFile(source)) {
    retired++;
    const row = rescueLedger.find(r => r.from === item.route);
    if (!row) { errors.push(`${source}: retirement has no exact redirect`); continue; }
    const target = new URL(row.to);
    const targetFile = target.pathname.endsWith('/') ? target.pathname.slice(1)+'index.html' : target.pathname.slice(1)+'.html';
    if (!fs.existsSync(targetFile) || isRetiredFile(targetFile)) errors.push(`${source}: redirect target is not a kept publication`);
    else if (extractTagValue(fs.readFileSync(targetFile,'utf8'),'link','rel','canonical','href') !== row.to) errors.push(`${source}: redirect target canonical mismatch`);
    for (const host of ['spryexecutiveos.com','billionairehighperformancecoach.com']) {
      const request = new Request(`https://${host}${item.route}?ref=publication-test`);
      const response = consolidationResponse(request) || spryRescueResponse(request);
      if (response?.status !== 301 || response.headers.get('location') !== row.to+'?ref=publication-test') errors.push(`${source}: permanent redirect/query contract failed on ${host}`);
    }
    const oldUrl = item.canonical_host + item.route;
    if (sitemap.includes(`<loc>${oldUrl}</loc>`) || llms.includes(oldUrl)) errors.push(`${source}: retired URL is still advertised`);
    const targetSitemap = fs.readFileSync(target.hostname === 'spryexecutiveos.com' ? 'sitemap-spry.xml' : 'sitemap-bhpc.xml','utf8');
    if (!targetSitemap.includes(`<loc>${row.to}</loc>`) || !llms.includes(row.to)) errors.push(`${source}: kept target is absent from discovery`);
    continue;
  }
  const filePath = path.join(ROOT, item.target_file || `${item.slug}.html`);
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing published page file: ${item.target_file || `${item.slug}.html`}`);
    continue;
  }

  const html = fs.readFileSync(filePath, 'utf8');
  const expectedUrl = `${item.canonical_host}${item.route}`;
  const canonical = extractTagValue(html, 'link', 'rel', 'canonical', 'href');
  const ogUrl = extractTagValue(html, 'meta', 'property', 'og:url', 'content');

  if (canonical !== expectedUrl) errors.push(`${item.target_file}: canonical mismatch`);
  if (ogUrl !== expectedUrl) errors.push(`${item.target_file}: og:url mismatch`);

  if (!htmlHasAnyHeading(html, ['Quick answer', 'Short answer'])) {
    errors.push(`${item.target_file}: missing required heading Quick answer/Short answer`);
  }

  if (!htmlHasAnyHeading(html, ['Authority layer', 'Source signals'])) {
    errors.push(`${item.target_file}: missing required heading Authority layer/Source signals`);
  }

  if (!htmlHasAnyHeading(html, ['Related internal links', 'Related links'])) {
    errors.push(`${item.target_file}: missing required heading Related internal links/Related links`);
  }

  const allowedCtaSnippets = [
    'Review the system manual to see how the full structure works',
    'Review the full system manual',
    'See how the full structure works',
    'Read the full system manual'
  ];

  if (!allowedCtaSnippets.some((snippet) => html.includes(snippet))) {
    errors.push(`${item.target_file}: missing approved CTA copy`);
  }

  for (const link of (item.required_links || [])) {
    if (!html.includes(`href="${link}"`) && !html.includes(`href='${link}'`)) {
      errors.push(`${item.target_file}: missing required link ${link}`);
    }
  }

  if (sitemap && !sitemap.includes(`<loc>${expectedUrl}</loc>`)) {
    errors.push(`${item.target_file}: missing from sitemap-spry.xml`);
  }

  if (llms && !llms.includes(expectedUrl)) {
    errors.push(`${item.target_file}: missing from llms-full.txt`);
  }

  if (coverageRoutes.size && !coverageRoutes.has(item.route)) {
    errors.push(`${item.target_file}: missing from knowledge-map/knowledge-map.json reddit velocity block`);
  }
}

if (errors.length) {
  console.error('validate_reddit_publish_contract failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log(`validate_reddit_publish_contract: OK (${items.length} publications checked; ${retired} permanent redirects verified)`);
