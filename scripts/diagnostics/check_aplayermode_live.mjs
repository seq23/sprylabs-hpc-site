#!/usr/bin/env node
/**
 * Post-deploy check of https://aplayermode.com (network; not part of the offline
 * validation matrix). Run after the Pages deploy and the workers/aplayermode-com
 * deploy: npm run check:aplayermode-live
 *
 * Refuses: a noindex page or X-Robots-Tag; a crawl file that is not 200 with the
 * right content type (robots.txt, sitemap.xml, llms.txt, site.webmanifest,
 * apple-touch-icon.png, favicon.ico, the og image); a page without its JSON-LD
 * @graph, og/twitter tags or the aplayermode.com Clarity project; and any other
 * path that stops 301-ing to /. The repo-side twin is validate_aplayermode_landing.
 */
const HOST = process.env.APM_LIVE_HOST || 'https://aplayermode.com';
const LABEL = '[check:aplayermode-live]';
const failures = [];
const fail = (m) => failures.push(m);
// Every request is bounded (15 s) and every body is read or cancelled, so the check
// always ends: an unread body kept the first version open past any useful wait.
const get = async (p) => {
  const r = await fetch(HOST + p, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (aplayermode live check)' } });
  const text = await r.text();
  return { status: r.status, headers: r.headers, text: async () => text };
};

const FILES = [
  ['/robots.txt', /^text\/plain/, (t) => t.includes('Sitemap: https://aplayermode.com/sitemap.xml') && /User-agent: GPTBot/.test(t) && /User-agent: ClaudeBot/.test(t)],
  ['/sitemap.xml', /xml/, (t) => /<loc>https:\/\/aplayermode\.com\/<\/loc>/.test(t) && /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(t)],
  ['/llms.txt', /^text\/plain/, (t) => t.startsWith('# A Player Mode')],
  ['/site.webmanifest', /manifest\+json|application\/json/, (t) => JSON.parse(t).name === 'A Player Mode'],
  ['/apple-touch-icon.png', /^image\/png/, null],
  ['/favicon.ico', /^image\//, null],
  ['/aplayermode/img/og.png', /^image\/png/, null],
];
let checked = 0;
for (const [p, type, body] of FILES) {
  const r = await get(p);
  const ct = r.headers.get('content-type') || '';
  checked += 1;
  if (r.status !== 200) { fail(`${p} answered ${r.status}${r.headers.get('location') ? ` -> ${r.headers.get('location')}` : ''}; expected 200`); continue; }
  if (!type.test(ct)) fail(`${p} content-type is "${ct}"`);
  if (body) { const t = await r.text(); let ok = false; try { ok = body(t); } catch { ok = false; } if (!ok) fail(`${p} body is not the committed file`); }
}
const page = await get('/');
const html = await page.text();
checked += 1;
if (page.status !== 200) fail(`/ answered ${page.status}`);
if (/noindex/i.test(page.headers.get('x-robots-tag') || '')) fail(`/ sends X-Robots-Tag: ${page.headers.get('x-robots-tag')}`);
if (!/<meta name="robots" content="index, follow">/.test(html) || /<meta[^>]*noindex/i.test(html)) fail('/ is not index, follow');
const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
let types = [];
try { types = JSON.parse(ld[1])['@graph'].map((n) => n['@type']); } catch { fail('/ has no parseable JSON-LD @graph'); }
for (const t of ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'Product', 'FAQPage']) if (!types.includes(t)) fail(`/ JSON-LD lacks ${t}`);
for (const tag of ['property="og:description"', 'property="og:type" content="website"', 'property="og:site_name" content="A Player Mode"', 'name="twitter:title"', 'name="twitter:description"', 'property="og:image" content="https://aplayermode.com/aplayermode/img/og.png"', 'property="og:image:width" content="1200"']) if (!html.includes(tag)) fail(`/ lacks <meta ${tag}>`);
if (!html.includes('"aplayermode.com":"yvtytxiv27"')) fail('/ Clarity loader does not resolve on aplayermode.com (yvtytxiv27)');
if (!/data-definition>A Player Mode is /.test(html)) fail('/ lacks the "A Player Mode is ..." definition');
for (const p of ['/download', '/guides/', '/sitemap-bhpc.xml', '/llms-full.txt']) {
  const r = await get(p); checked += 1;
  if (r.status !== 301 || r.headers.get('location') !== `${HOST}/`) fail(`${p} must 301 to ${HOST}/, got ${r.status} ${r.headers.get('location')}`);
}
// A REAL 404 for a path this host does not have. It used to 301 home, so every typo and every dead
// inbound link looked like the homepage to Google (Search Readiness a9, 25 Oct 2026).
for (const p of [`/no-such-page-${Date.now().toString(36)}/`, '/about.html', '/admin.html']) {
  const r = await get(p); checked += 1;
  if (r.status !== 404) fail(`${p} must answer 404, got ${r.status}${r.headers.get('location') ? ` -> ${r.headers.get('location')}` : ''}`);
  else {
    const t = await r.text();
    if (!/noindex/i.test(t) || !t.includes('href="/"')) fail(`${p} answered 404 but not with the apex 404 page (noindex, a link home)`);
  }
}
// The About page: the publisher an answer engine can cite, and the home page links it.
{
  const r = await get('/about/'); checked += 1;
  const t = r.status === 200 ? await r.text() : '';
  if (r.status !== 200) fail(`/about/ must answer 200, got ${r.status}${r.headers.get('location') ? ` -> ${r.headers.get('location')}` : ''}`);
  else if (!/<link rel="canonical" href="https:\/\/aplayermode\.com\/about\/">/.test(t) || !/Spry Labs/.test(t)) fail('/about/ is not the About page (canonical + the publisher Spry Labs)');
  const bare = await get('/about'); checked += 1;
  if (bare.status !== 301 || bare.headers.get('location') !== `${HOST}/about/`) fail(`/about must 301 to ${HOST}/about/, got ${bare.status} ${bare.headers.get('location')}`);
  if (!/href="\/about\/"/.test(html)) fail('/ does not link the About page');
}
if (failures.length) { for (const f of failures) console.error(`${LABEL} FAIL ${f}`); console.error(`${LABEL} FAIL (${failures.length}) - ${checked} URLs`); process.exit(1); }
console.log(`${LABEL} PASS - ${checked} URLs on ${HOST}`);
process.exit(0);
