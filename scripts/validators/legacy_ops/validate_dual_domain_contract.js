const fs = require('fs');
const path = require('path');
const root = process.cwd();
const required = ['.gitignore', 'README.md', 'package.json', 'sitemap.xml', 'sitemap-bhpc.xml', 'sitemap-spry.xml', 'robots.txt', 'llms.txt'];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`Missing required root file: ${file}`);
    process.exit(1);
  }
}
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.pages-output', 'node_modules', 'templates', 'docs', 'reports', 'scripts', 'config', 'data', 'content', 'fixtures', 'tests', 'artifacts'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (rel.startsWith('data/report_fixes/agent_runs/')) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}
const { routeFor, hostFor } = require('../../lib/dual_domain_policy.cjs');
const publishedManifestPath = path.join(root, 'data/reddit/published_manifest.json');
const publishedManifest = fs.existsSync(publishedManifestPath) ? JSON.parse(fs.readFileSync(publishedManifestPath, 'utf8')) : { items: [] };
const publishedHostOverrides = new Map((publishedManifest.items || []).map((item) => [item.route, item.canonical_host]));

const generatedOnly = process.env.DUAL_DOMAIN_GENERATED_ONLY === '1';
const GENERATED_MIN_WORDS = Number(process.env.GENERATED_PAGE_MIN_WORDS || 300);
const GENERATED_MAX_WORDS = Number(process.env.GENERATED_PAGE_MAX_WORDS || 650);


function extractTagValue(html, tagName, keyName, keyValue, valueAttr) {
  const re = new RegExp(`<${tagName}[^>]*${keyName}=["']${keyValue}["'][^>]*${valueAttr}=["']([^"']*)["'][^>]*>|<${tagName}[^>]*${valueAttr}=["']([^"']*)["'][^>]*${keyName}=["']${keyValue}["'][^>]*>`, 'is');
  const m = html.match(re);
  if (!m) return '';
  return m[1] || m[2] || '';
}
function hasNoindex(html) {
  const robots = extractTagValue(html, 'meta', 'name', 'robots', 'content').toLowerCase();
  return robots.includes('noindex');
}
const htmlFiles = walk(root);

const routeManifestPath = path.join(root, 'data/routes/public_route_manifest.json');
const routeManifest = fs.existsSync(routeManifestPath) ? JSON.parse(fs.readFileSync(routeManifestPath, 'utf8')) : { routes: [] };
const privateNoindexFiles = new Set((routeManifest.routes || routeManifest.items || [])
  .filter((item) => item && item.visibility === 'private_noindex' && item.source_file)
  .map((item) => String(item.source_file).replace(/\\/g, '/')));
function isPrivateNoindex(rel, html) {
  if (privateNoindexFiles.has(rel)) return true;
  if ((rel === 'admin.html' || rel.startsWith('admin/')) && hasNoindex(html)) return true;
  return rel === 'admin.html' && /http-equiv=["']refresh["'][^>]*\/admin\//i.test(html);
}
const errors = [];
const warnings = [];
const titles = new Map();
const descs = new Map();
const founderPages = new Set(['index.html','sequoia-taylor.html','billionaire-high-performance-coach.html','faq.html','what-is-this-system.html','start-here.html','work-with-spry.html','ai-executive-coach.html','ai-coach-vs-human-coach.html','chatgpt-vs-executive-coach.html','best-ai-coaching-tools.html','how-to-build-a-coaching-system.html','is-ai-coaching-effective.html']);
const WORD_COUNT_WARN_MARGIN = 15;

const minWordChecks = new Map([
  ['pillars/leverage/index.html', 240],
  ['pillars/systems-decisions/index.html', 240],
  ['pillars/accountability/index.html', 240],
  ['faq/index.html', 300],
  ['ai-coach-vs-human-coach.html', 420],
  ['chatgpt-vs-executive-coach.html', 420],
  ['best-ai-coaching-tools.html', 420],
  ['how-to-build-a-coaching-system.html', 420],
  ['is-ai-coaching-effective.html', 420],
  ['answers/index.html', 360],
  ['comparisons/index.html', 340],
  ['pillars/index.html', 240],
  ['pillars/burnout-recovery/index.html', 240],
  ['pillars/wealth/index.html', 240],
  ['pillars/systems.html', 240],
  ['pillars/body.html', 240],
  ['pillars/money.html', 240],
  ['pillars/spirit.html', 240],
  ['pillars/mind.html', 240],
  ['product.html', 280],
  ['knowledge-map/index.html', 420],
]);


const generatedPagesPath = path.join(root, 'data/reddit/generated_pages.json');
const generatedPages = fs.existsSync(generatedPagesPath) ? JSON.parse(fs.readFileSync(generatedPagesPath, 'utf8')) : [];
const generatedRouteMap = new Map(generatedPages.map(p => [p.slug + '.html', p]));
const citationRegistryPath = path.join(root, 'data/citation/citable_pages.json');
const citationRegistry = fs.existsSync(citationRegistryPath) ? JSON.parse(fs.readFileSync(citationRegistryPath, 'utf8')) : { pages: [] };
const citationPriorityPages = new Set((citationRegistry.pages || []).filter(p => p.priority === true).map(p => p.path));

if (generatedOnly) {
  for (const file of htmlFiles) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (!generatedRouteMap.has(rel)) continue;
    const html = fs.readFileSync(file, 'utf8');
  const privateNoindex = isPrivateNoindex(rel, html);
  if (privateNoindex) {
    if (!hasNoindex(html)) errors.push(`${rel}: private admin surface must declare noindex`);
    continue;
  }
    const page = generatedRouteMap.get(rel);
    const words = stripText(html).split(/\s+/).filter(Boolean).length;
    if (words < GENERATED_MIN_WORDS || words > GENERATED_MAX_WORDS) console.log(`[dual-domain-info] ${rel}: generated page word count ${words} outside target ${GENERATED_MIN_WORDS}-${GENERATED_MAX_WORDS}`);
    for (const requiredLink of page.required_links || []) {
      if (!html.includes(`href="${requiredLink}"`) && !html.includes(`href='${requiredLink}'`)) errors.push(`${rel}: missing required internal link ${requiredLink}`);
    }
    if (!html.includes('Review the system manual to see how the full structure works')) errors.push(`${rel}: missing canonical CTA copy`);
  }
  if (errors.length) {
    console.error('validate_dual_domain_contract failed:');
    for (const err of errors) console.error(' - ' + err);
    process.exit(1);
  }
  console.log(`validate_dual_domain_contract: OK generated precheck (${generatedPages.length} generated pages checked)`);
  process.exit(0);
}

const requiredHeadings = new Map([
  ['pillars/leverage/index.html', ['What leverage means here']],
  ['pillars/systems-decisions/index.html', ['What systems and decisions have to do with each other']],
  ['pillars/accountability/index.html', ['How accountability is defined on this site']],
  ['answers/index.html', ['How to use the answers section']],
  ['comparisons/index.html', ['Why comparisons matter on this site']],
  ['pillars/index.html', ['Why the pillar model exists']],
  ['ai-executive-coach.html', ['Named system vocabulary']],
  ['pillars/burnout-recovery/index.html', ['What burnout means in this system']],
  ['pillars/wealth/index.html', ['What wealth means in this framework']],
  ['pillars/systems.html', ['What a system does']],
  ['pillars/body.html', ['Why body affects execution']],
  ['pillars/money.html', ['What money means here']],
  ['pillars/spirit.html', ['What spirit means on this site']],
  ['pillars/mind.html', ['Why mind affects the system']],
  ['product.html', ['What this page is for']],
  ['knowledge-map/index.html', ['What this page is for']],
]);

function stripText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
for (const file of htmlFiles) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const route = routeFor(rel);
  const host = hostFor(route, publishedHostOverrides);
  const expectedCanonical = host + route;
  const html = fs.readFileSync(file, 'utf8');
  const privateNoindex = isPrivateNoindex(rel, html);
  if (privateNoindex) {
    if (!hasNoindex(html)) errors.push(`${rel}: private admin surface must declare noindex`);
    continue;
  }
  if (!html.includes('/assets/domain-context.js')) errors.push(`${rel}: missing domain-context.js include`);
  if (/Sequoia Taylor/.test(html)) errors.push(`${rel}: founder naming regression uses Sequoia Taylor`);
  if (founderPages.has(rel) && !html.includes('>personal website<')) errors.push(`${rel}: missing exact personal website anchor`);
  if (minWordChecks.has(rel)) {
    const words = stripText(html).split(/\s+/).filter(Boolean).length;
    const floor = minWordChecks.get(rel);
    if (words < floor) {
      const delta = floor - words;
      if (delta <= WORD_COUNT_WARN_MARGIN) warnings.push(`${rel}: near floor word count ${words} < ${floor} (warn-only; margin=${WORD_COUNT_WARN_MARGIN})`);
      else errors.push(`${rel}: below minimum word count ${words} < ${floor}`);
    }
  }
  if (requiredHeadings.has(rel)) {
    for (const heading of requiredHeadings.get(rel)) {
      if (!html.includes(`>${heading}<`)) errors.push(`${rel}: missing required heading ${heading}`);
    }
  }
  if (generatedRouteMap.has(rel) && !citationPriorityPages.has(rel)) {
    const page = generatedRouteMap.get(rel);
    const words = stripText(html).split(/\s+/).filter(Boolean).length;
    if (words < GENERATED_MIN_WORDS || words > GENERATED_MAX_WORDS) console.log(`[dual-domain-info] ${rel}: generated page word count ${words} outside target ${GENERATED_MIN_WORDS}-${GENERATED_MAX_WORDS}`);
    for (const requiredLink of page.required_links || []) {
      if (!html.includes(`href="${requiredLink}"`) && !html.includes(`href='${requiredLink}'`)) errors.push(`${rel}: missing required internal link ${requiredLink}`);
    }
    if (!html.includes('Review the system manual to see how the full structure works')) errors.push(`${rel}: missing canonical CTA copy`);
  }
  if (/â|â€™|â€“|â€”/.test(html)) errors.push(`${rel}: mojibake remains`);
  if (/-2\.html/.test(rel)) errors.push(`${rel}: duplicate -2 page forbidden`);
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  if (h1Count !== 1) errors.push(`${rel}: expected exactly one h1, found ${h1Count}`);
  const title = ((html.match(/<title>(.*?)<\/title>/is) || [,''])[1] || '').replace(/\s+/g, ' ').trim();
  const desc = extractTagValue(html, 'meta', 'name', 'description', 'content').trim();
  const canonical = extractTagValue(html, 'link', 'rel', 'canonical', 'href');
  const ogUrl = extractTagValue(html, 'meta', 'property', 'og:url', 'content');
  const ogImg = extractTagValue(html, 'meta', 'property', 'og:image', 'content');
  const twImg = extractTagValue(html, 'meta', 'name', 'twitter:image', 'content');
  const noindex = hasNoindex(html);
  if (!title) errors.push(`${rel}: missing title`);
  if (!desc) errors.push(`${rel}: missing meta description`);
  if (title && !noindex) {
    if (titles.has(title)) errors.push(`${rel}: duplicate title matches ${titles.get(title)}`);
    else titles.set(title, rel);
  }
  if (desc && !noindex && rel !== 'download.html') {
    if (descs.has(desc)) warnings.push(`${rel}: duplicate description matches ${descs.get(desc)} (warning-only metadata hygiene)`);
    else descs.set(desc, rel);
  }
  if (!canonical) errors.push(`${rel}: missing canonical`);
  else if (!/^https?:\/\//.test(canonical)) errors.push(`${rel}: canonical not absolute`);
  else if (canonical !== expectedCanonical && !noindex) errors.push(`${rel}: canonical mismatch actual ${canonical} expected ${expectedCanonical}`);
  if (!ogUrl) errors.push(`${rel}: missing og:url`);
  else if (!/^https?:\/\//.test(ogUrl)) errors.push(`${rel}: og:url not absolute`);
  else if (ogUrl !== canonical) errors.push(`${rel}: og:url mismatch canonical`);
  if (!ogImg) errors.push(`${rel}: missing og:image`);
  if (!twImg) errors.push(`${rel}: missing twitter:image`);
  if (rel === 'download.html' && !html.includes('Secure checkout via Gumroad. Instant download after purchase.')) errors.push('download.html: visible body appears altered unexpectedly');
  if (rel === 'download.html' && !html.includes('https://sprylabs.gumroad.com/l/billionaire-high-performance-coach')) errors.push('download.html: Gumroad checkout link missing');
  if (route === '/' && !html.includes('"@type": "Organization"') && !html.includes('"@type":"Organization"')) errors.push('index.html: homepage missing Organization schema');
  if (route === '/' && !html.includes('"@type": "WebSite"') && !html.includes('"@type":"WebSite"')) errors.push('index.html: homepage missing WebSite schema');
  if (route === '/' && !html.includes('"@type": "Product"') && !html.includes('"@type":"Product"')) errors.push('index.html: homepage missing Product schema');
  if (rel === 'work-with-spry.html' && /"url":""|"sameAs":\[\]/.test(html)) errors.push('work-with-spry.html: empty schema fields remain');
}
const sitemapIndex = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
if (!sitemapIndex.includes('https://billionairehighperformancecoach.com/sitemap-bhpc.xml')) errors.push('sitemap.xml: missing bhpc sitemap');
if (!sitemapIndex.includes('https://spryexecutiveos.com/sitemap-spry.xml')) errors.push('sitemap.xml: missing spry sitemap');
const spryMap = fs.readFileSync(path.join(root, 'sitemap-spry.xml'), 'utf8');
if (spryMap.includes('https://billionairehighperformancecoach.com')) errors.push('sitemap-spry.xml: wrong host present');
const bhpcMap = fs.readFileSync(path.join(root, 'sitemap-bhpc.xml'), 'utf8');
if (bhpcMap.includes('https://spryexecutiveos.com')) errors.push('sitemap-bhpc.xml: wrong host present');

if (!spryMap.includes('https://spryexecutiveos.com/knowledge-map/')) errors.push('sitemap-spry.xml: missing knowledge-map route');
if (bhpcMap.includes('https://billionairehighperformancecoach.com/knowledge-map/')) errors.push('sitemap-bhpc.xml: knowledge-map route must not be on bhpc sitemap');
if (warnings.length) {
  console.warn('validate_dual_domain_contract warnings:');
  for (const warning of warnings) console.warn(' - ' + warning);
}
if (errors.length) {
  console.error('validate_dual_domain_contract failed:');
  for (const err of errors) console.error(' - ' + err);
  process.exit(1);
}
console.log(`validate_dual_domain_contract: OK (${htmlFiles.length} html files checked)`);

process.exit(0);
