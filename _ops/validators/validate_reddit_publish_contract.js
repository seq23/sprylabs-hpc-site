const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const publishedPath = path.join(ROOT, 'data/reddit/published_manifest.json');
const sitemapPath = path.join(ROOT, 'sitemap-spry.xml');
const llmsPath = path.join(ROOT, 'llms.txt');
const coveragePath = path.join(ROOT, 'coverage/coverage.json');

if (!fs.existsSync(publishedPath)) {
  console.log('validate_reddit_publish_contract: no published manifest');
  process.exit(0);
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

for (const item of items) {
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
    errors.push(`${item.target_file}: missing from llms.txt`);
  }

  if (coverageRoutes.size && !coverageRoutes.has(item.route)) {
    errors.push(`${item.target_file}: missing from coverage/coverage.json reddit velocity block`);
  }
}

if (errors.length) {
  console.error('validate_reddit_publish_contract failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log(`validate_reddit_publish_contract: OK (${items.length} published pages checked)`);
