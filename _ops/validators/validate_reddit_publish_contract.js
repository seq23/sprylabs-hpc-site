
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
const coverageRoutes = new Set((((coverage || {}).redditVelocity || {}).latestRoutes || []).map((item) => item.route));
const errors = [];

function extractTagValue(html, tagName, keyName, keyValue, valueAttr) {
  const re = new RegExp(`<${tagName}[^>]*${keyName}=["']${keyValue}["'][^>]*${valueAttr}=["']([^"']*)["'][^>]*>|<${tagName}[^>]*${valueAttr}=["']([^"']*)["'][^>]*${keyName}=["']${keyValue}["'][^>]*>`, 'is');
  const match = html.match(re);
  return match ? (match[1] || match[2] || '') : '';
}

for (const item of (manifest.items || [])) {
  const filePath = path.join(ROOT, item.target_file || `${item.slug}.html`);
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing published page file: ${item.target_file}`);
    continue;
  }
  const html = fs.readFileSync(filePath, 'utf8');
  const canonical = extractTagValue(html, 'link', 'rel', 'canonical', 'href');
  const ogUrl = extractTagValue(html, 'meta', 'property', 'og:url', 'content');
  const headingChecks = ['<h2>Short answer</h2>', '<h2>Source signals</h2>', '<h2>Related internal links</h2>'];
  if (canonical !== `${item.canonical_host}${item.route}`) errors.push(`${item.target_file}: canonical mismatch`);
  if (ogUrl !== `${item.canonical_host}${item.route}`) errors.push(`${item.target_file}: og:url mismatch`);
  for (const heading of headingChecks) {
    if (!html.includes(heading)) errors.push(`${item.target_file}: missing required heading ${heading}`);
  }
  if (!html.includes('Review the system manual to see how the full structure works')) errors.push(`${item.target_file}: missing CTA copy`);
  for (const link of (item.required_links || [])) {
    if (!html.includes(`href="${link}"`) && !html.includes(`href='${link}'`)) errors.push(`${item.target_file}: missing required link ${link}`);
  }
  const fullUrl = `${item.canonical_host}${item.route}`;
  if (!sitemap.includes(`<loc>${fullUrl}</loc>`)) errors.push(`${item.target_file}: missing from sitemap-spry.xml`);
  if (!llms.includes(fullUrl)) errors.push(`${item.target_file}: missing from llms.txt`);
  if (!coverageRoutes.has(item.route)) errors.push(`${item.target_file}: missing from coverage/coverage.json reddit velocity block`);
}

if (errors.length) {
  console.error('validate_reddit_publish_contract failed');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`validate_reddit_publish_contract: OK (${(manifest.items || []).length} published pages checked)`);
