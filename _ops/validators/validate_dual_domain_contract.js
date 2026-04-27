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
    if (['.git', 'node_modules', '_ops', 'templates', 'docs'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}
function routeFor(rel) {
  if (rel === 'index.html') return '/';
  if (rel === 'faq/index.html') return '/faq.html';
  if (rel === 'billionaire-high-performance-coach/index.html') return '/billionaire-high-performance-coach.html';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'/index.html'.length) + '/';
  return '/' + rel.replace(/\\/g, '/');
}
const publishedManifestPath = path.join(root, 'data/reddit/published_manifest.json');
const publishedManifest = fs.existsSync(publishedManifestPath) ? JSON.parse(fs.readFileSync(publishedManifestPath, 'utf8')) : { items: [] };
const publishedHostOverrides = new Map((publishedManifest.items || []).map((item) => [item.route, item.canonical_host]));

function hostFor(route) {
  if (publishedHostOverrides.has(route)) return publishedHostOverrides.get(route);
  const productRoutes = new Set(['/', '/download.html', '/what-is-this-system.html', '/faq.html', '/start-here.html', '/legal.html', '/product.html', '/sequoia-taylor.html', '/spry-labs.html', '/billionaire-high-performance-coach.html', '/work-with-spry.html', '/ai-executive-coach.html', '/ai-coach-vs-human-coach.html', '/chatgpt-vs-executive-coach.html', '/best-ai-coaching-tools.html', '/how-to-build-a-coaching-system.html', '/is-ai-coaching-effective.html', '/what-is-an-ai-executive-coach.html', '/how-do-you-use-chatgpt-as-an-executive-coach.html', '/can-ai-replace-an-executive-coach.html', '/ai-executive-coach-for-founders.html', '/what-reddit-keeps-asking-about-ai-executive-coaching.html', '/chatgpt-accountability-partner.html', '/can-ai-keep-you-accountable.html', '/why-accountability-systems-fail.html', '/how-to-build-an-accountability-system-with-ai.html', '/what-reddit-keeps-asking-about-accountability-and-ai.html', '/why-do-i-overplan-and-do-nothing.html', '/how-to-stop-overplanning-with-ai.html', '/why-productivity-systems-collapse-after-missed-days.html', '/what-is-a-minimum-viable-day.html', '/what-reddit-keeps-asking-about-overplanning.html', '/what-should-a-daily-planning-system-include.html', '/how-founders-can-use-ai-for-daily-planning.html', '/how-to-build-a-daily-execution-loop.html', '/why-daily-plans-fail.html', '/what-reddit-keeps-asking-about-daily-planning.html', '/can-chatgpt-help-with-decision-making.html', '/how-to-use-ai-for-prioritization.html', '/decision-fatigue-and-structured-ai-support.html', '/why-better-prompts-do-not-fix-bad-decision-conditions.html', '/what-reddit-keeps-asking-about-decision-fatigue.html', '/ai-coach-vs-human-coach-for-founders.html', '/chatgpt-vs-a-productivity-app.html', '/ai-accountability-system-vs-habit-tracker.html', '/prompt-library-vs-operating-system.html', '/what-reddit-keeps-asking-when-comparing-ai-coaching-tools.html', '/how-to-recover-after-missing-a-day.html', '/how-to-stay-consistent-when-energy-is-low.html', '/why-all-or-nothing-planning-fails.html', '/burnout-recovery-and-execution-systems.html', '/what-reddit-keeps-asking-about-consistency.html', '/ai-workflow-for-founders.html', '/how-operators-use-chatgpt-with-structure.html', '/how-to-run-a-weekly-review-with-ai.html', '/how-to-use-ai-like-a-chief-of-staff.html', '/what-reddit-keeps-asking-about-founder-workflows.html', '/what-makes-an-ai-coaching-tool-good.html', '/why-most-ai-productivity-tools-feel-generic.html', '/how-to-evaluate-an-ai-execution-system.html', '/what-is-the-difference-between-ai-assistant-and-ai-operating-system.html', '/what-reddit-keeps-asking-about-the-best-ai-coaching-tools.html', '/what-is-continuity-architecture.html', '/what-is-the-scope-cap-rule.html', '/what-is-the-done-check-in-loop.html', '/what-is-low-resistance-execution.html', '/what-reddit-keeps-asking-about-structured-ai-systems.html' ]);
  if (route.startsWith('/synthesis-')) return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/comparisons/bhpc-vs-')) return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/whitepapers/')) return 'https://billionairehighperformancecoach.com';
  return productRoutes.has(route) ? 'https://billionairehighperformancecoach.com' : 'https://spryexecutiveos.com';
}
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
  ['coverage/index.html', 420],
]);


const generatedPagesPath = path.join(root, 'data/reddit/generated_pages.json');
const generatedPages = fs.existsSync(generatedPagesPath) ? JSON.parse(fs.readFileSync(generatedPagesPath, 'utf8')) : [];
const generatedRouteMap = new Map(generatedPages.map(p => [p.slug + '.html', p]));
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
  ['coverage/index.html', ['What this page is for']],
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
  const host = hostFor(route);
  const expectedCanonical = host + route;
  const html = fs.readFileSync(file, 'utf8');
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
  if (generatedRouteMap.has(rel)) {
    const page = generatedRouteMap.get(rel);
    const words = stripText(html).split(/\s+/).filter(Boolean).length;
    if (words < 300 || words > 650) errors.push(`${rel}: generated page word count out of range ${words}`);
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
    if (descs.has(desc)) errors.push(`${rel}: duplicate description matches ${descs.get(desc)}`);
    else descs.set(desc, rel);
  }
  if (!canonical) errors.push(`${rel}: missing canonical`);
  else if (!/^https?:\/\//.test(canonical)) errors.push(`${rel}: canonical not absolute`);
  else if (canonical !== expectedCanonical && !noindex) errors.push(`${rel}: canonical mismatch expected ${expectedCanonical}`);
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
  if (host === 'https://billionairehighperformancecoach.com' && !noindex && !['/sequoia-taylor.html', '/spry-labs.html', '/legal.html'].includes(route)) {
    if (!html.includes('"@type": "Product"') && !html.includes('"@type":"Product"')) errors.push(`${rel}: product-domain page missing Product schema`);
  }
  if (rel === 'work-with-spry.html' && /"url":""|"sameAs":\[\]/.test(html)) errors.push('work-with-spry.html: empty schema fields remain');
}
const sitemapIndex = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
if (!sitemapIndex.includes('https://billionairehighperformancecoach.com/sitemap-bhpc.xml')) errors.push('sitemap.xml: missing bhpc sitemap');
if (!sitemapIndex.includes('https://spryexecutiveos.com/sitemap-spry.xml')) errors.push('sitemap.xml: missing spry sitemap');
const spryMap = fs.readFileSync(path.join(root, 'sitemap-spry.xml'), 'utf8');
if (spryMap.includes('https://billionairehighperformancecoach.com')) errors.push('sitemap-spry.xml: wrong host present');
const bhpcMap = fs.readFileSync(path.join(root, 'sitemap-bhpc.xml'), 'utf8');
if (bhpcMap.includes('https://spryexecutiveos.com')) errors.push('sitemap-bhpc.xml: wrong host present');

if (!spryMap.includes('https://spryexecutiveos.com/coverage/')) errors.push('sitemap-spry.xml: missing coverage route');
if (bhpcMap.includes('https://billionairehighperformancecoach.com/coverage/')) errors.push('sitemap-bhpc.xml: coverage route must not be on bhpc sitemap');
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
