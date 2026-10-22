// Edge HTML cache guard (21 Oct 2026). Static public pages must be answered from
// the edge cache on the second request; checkout, /api, admin, sign-up, forms,
// redirects and anything with auth must never be stored. Run: npm run validate:edge-cache
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  serveWithEdgeCache, isCacheableRequest, isPagePath, cacheKey, EDGE_CACHE_HEADER, NEVER_CACHE_PREFIXES,
} from '../functions/_lib/edge_cache.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fakeCache() {
  const store = new Map();
  return {
    store,
    async match(req) { const r = store.get(typeof req === 'string' ? req : req.url); return r ? r.clone() : undefined; },
    async put(req, res) {
      const cc = res.headers.get('cache-control') || '';
      if (!/max-age=[1-9]/.test(cc)) throw new Error(`cache.put would store nothing: cache-control "${cc}"`);
      store.set(typeof req === 'string' ? req : req.url, res);
    },
  };
}
const html = (body = '<!doctype html><p>page</p>', headers = {}) => () => Promise.resolve(new Response(body, {
  status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate', ...headers },
}));
async function twice(url, { init = {}, origin = html(), buildId = 'build-a', cache = fakeCache(), htmlOnly = true } = {}) {
  let originCalls = 0;
  const fetchOrigin = () => { originCalls += 1; return origin(); };
  const states = [];
  for (let i = 0; i < 2; i += 1) {
    const res = await serveWithEdgeCache({ request: new Request(url, init), buildId, cache, waitUntil: null, fetchOrigin, htmlOnly });
    states.push(res.headers.get(EDGE_CACHE_HEADER));
    await res.text();
  }
  return { states, originCalls, cache };
}

const STATIC_PAGES = [
  'https://billionairehighperformancecoach.com/',
  'https://billionairehighperformancecoach.com/about.html',
  'https://billionairehighperformancecoach.com/how-to-plan-your-day/',
  'https://spryexecutiveos.com/',
  'https://spryexecutiveos.com/faq.html',
  'https://spryexecutiveos.com/how-to-be-disciplined/?utm_source=pinterest&utm_medium=organic',
  'https://aplayermode.com/',
  'https://aplayermode.com/?utm_source=pinterest&utm_content=founding-100&fbclid=x',
];

test('static public pages: MISS then HIT, origin fetched once', async () => {
  for (const url of STATIC_PAGES) {
    const { states, originCalls } = await twice(url);
    assert.deepEqual(states, ['MISS', 'HIT'], url);
    assert.equal(originCalls, 1, url);
  }
});

test('a HIT keeps the browser on the origin Cache-Control (only the edge copy lives long)', async () => {
  const cache = fakeCache();
  const url = 'https://billionairehighperformancecoach.com/';
  await (await serveWithEdgeCache({ request: new Request(url), buildId: 'b', cache, fetchOrigin: html() })).text();
  const hit = await serveWithEdgeCache({ request: new Request(url), buildId: 'b', cache, fetchOrigin: html() });
  assert.equal(hit.headers.get(EDGE_CACHE_HEADER), 'HIT');
  assert.equal(hit.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  assert.equal(hit.headers.get('x-origin-cache-control'), null);
});

test('keys are per host + path + build; a deploy never serves the previous build', async () => {
  assert.notEqual(cacheKey('https://billionairehighperformancecoach.com/x', 'b').url, cacheKey('https://spryexecutiveos.com/x', 'b').url);
  assert.notEqual(cacheKey('https://aplayermode.com/', 'b1').url, cacheKey('https://aplayermode.com/', 'b2').url);
  assert.equal(cacheKey('https://aplayermode.com/?utm_source=a', 'b').url, cacheKey('https://aplayermode.com/', 'b').url);
  const cache = fakeCache();
  await twice('https://aplayermode.com/', { cache, buildId: 'old' });
  const { states } = await twice('https://aplayermode.com/', { cache, buildId: 'new', origin: html('<p>new</p>') });
  assert.deepEqual(states, ['MISS', 'HIT']);
});

test('no build id = never cached (fail safe, visible as BYPASS)', async () => {
  const { states, originCalls, cache } = await twice('https://billionairehighperformancecoach.com/', { buildId: '' });
  assert.deepEqual(states, ['BYPASS', 'BYPASS']);
  assert.equal(originCalls, 2);
  assert.equal(cache.store.size, 0);
});

const EXCLUDED_REQUESTS = [
  ['https://billionairehighperformancecoach.com/api/admin/login', {}],
  ['https://billionairehighperformancecoach.com/api/admin/session', {}],
  ['https://billionairehighperformancecoach.com/admin.html', {}],
  ['https://billionairehighperformancecoach.com/admin/', {}],
  ['https://aplayermode.com/checkout', {}],
  ['https://aplayermode.com/join', {}],
  ['https://aplayermode.com/billing/portal', {}],
  ['https://aplayermode.com/signup', {}],
  ['https://aplayermode.com/sign-up/', {}],
  ['https://spryexecutiveos.com/login', {}],
  ['https://spryexecutiveos.com/contact', {}],
  ['https://spryexecutiveos.com/stripe/success', {}],
  ['https://spryexecutiveos.com/gumroad', {}],
  ['https://billionairehighperformancecoach.com/', { method: 'POST', body: 'a=1' }],
  ['https://billionairehighperformancecoach.com/', { method: 'HEAD' }],
  ['https://billionairehighperformancecoach.com/?session=abc', {}],
  ['https://billionairehighperformancecoach.com/?q=search', {}],
  ['https://billionairehighperformancecoach.com/', { headers: { authorization: 'Bearer x' } }],
  ['https://billionairehighperformancecoach.com/', { headers: { cookie: '_clck=1; spry_admin=abc.def' } }],
];

test('excluded requests are never stored and never served from cache', async () => {
  for (const [url, init] of EXCLUDED_REQUESTS) {
    assert.equal(isCacheableRequest(new Request(url, init)), false, `${init.method || 'GET'} ${url} must not be cacheable`);
    const { states, originCalls, cache } = await twice(url, { init });
    assert.deepEqual(states, ['BYPASS', 'BYPASS'], url);
    assert.equal(originCalls, 2, url);
    assert.equal(cache.store.size, 0, url);
  }
});

test('analytics cookies alone do not stop a static page being cached', () => {
  assert.equal(isCacheableRequest(new Request('https://aplayermode.com/', { headers: { cookie: '_clck=abc; _clsk=def' } })), true);
});

const EXCLUDED_RESPONSES = [
  ['redirect', () => Promise.resolve(new Response(null, { status: 301, headers: { location: 'https://aplayermode.com/' } }))],
  ['not found', () => Promise.resolve(new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } }))],
  ['server error', () => Promise.resolve(new Response('err', { status: 500, headers: { 'content-type': 'text/html' } }))],
  ['set-cookie', html(undefined, { 'set-cookie': 'spry_admin=x; HttpOnly' })],
  ['no-store', html(undefined, { 'cache-control': 'no-store' })],
  ['private', html(undefined, { 'cache-control': 'private, max-age=60' })],
  ['json on an html-only host', () => Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))],
];

test('excluded responses (redirects, errors, cookies, no-store, non-HTML) are never stored', async () => {
  for (const [name, origin] of EXCLUDED_RESPONSES) {
    const { states, cache } = await twice('https://billionairehighperformancecoach.com/some-page/', { origin });
    assert.deepEqual(states, ['BYPASS', 'BYPASS'], name);
    assert.equal(cache.store.size, 0, name);
  }
});

test('never-cache list still names every checkout/api/admin/sign-up surface', () => {
  for (const p of ['/api/', '/admin', '/checkout', '/billing', '/stripe', '/gumroad', '/join', '/signup', '/sign-up', '/login', '/account', '/contact', '/form']) {
    assert.ok(NEVER_CACHE_PREFIXES.includes(p), `NEVER_CACHE_PREFIXES lost ${p}`);
  }
});

test('Pages middleware: files pass through untouched, pages use the stamped BUILD_ID', async () => {
  assert.equal(isPagePath('/'), true);
  assert.equal(isPagePath('/about.html'), true);
  assert.equal(isPagePath('/how-to-plan-your-day/'), true);
  assert.equal(isPagePath('/assets/domain-context.js'), false);
  assert.equal(isPagePath('/sitemap.xml'), false);
  const { BUILD_ID } = await import('../functions/_lib/build_id.js');
  assert.equal(BUILD_ID, '', 'functions/_lib/build_id.js must be committed empty (only the Pages build stamps it)');
  const mw = await import('../functions/_middleware.js');
  let nextCalls = 0;
  const ctx = (url) => ({ request: new Request(url), waitUntil() {}, next: () => { nextCalls += 1; return Promise.resolve(new Response('x', { status: 200, headers: { 'content-type': 'text/css' } })); } });
  const css = await mw.onRequest(ctx('https://billionairehighperformancecoach.com/assets/site.css'));
  assert.equal(css.headers.get(EDGE_CACHE_HEADER), null, 'a file must pass straight through');
  const page = await mw.onRequest(ctx('https://billionairehighperformancecoach.com/'));
  assert.equal(page.headers.get(EDGE_CACHE_HEADER), 'BYPASS', 'unstamped build must bypass');
  assert.equal(nextCalls, 2);
  const assemble = fs.readFileSync(path.join(ROOT, 'scripts', 'assemble_pages_output.js'), 'utf8');
  assert.match(assemble, /process\.env\.CF_PAGES === '1'/);
  assert.match(assemble, /functions', '_lib', 'build_id\.js'/);
  assert.match(assemble, /'build-id\.txt'/);
});

test('aplayermode.com Worker: page and files cached per Pages build, feed and redirects never', async () => {
  const cache = fakeCache();
  const originHits = [];
  let pagesBuild = 'pagesbuild-1';
  globalThis.caches = { default: cache };
  globalThis.fetch = async (input) => {
    const u = new URL(typeof input === 'string' ? input : input.url);
    originHits.push(u.pathname);
    if (u.pathname === '/build-id.txt') return new Response(pagesBuild + '\n', { status: 200 });
    if (u.pathname === '/aplayermode/data/pinterest/queue.json') return new Response(fs.readFileSync(path.join(ROOT, 'aplayermode', 'data', 'pinterest', 'queue.json'), 'utf8'), { status: 200, headers: { 'content-type': 'application/json' } });
    const type = u.pathname.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8';
    return new Response('ok ' + u.pathname, { status: 200, headers: { 'content-type': type, 'cache-control': 'public, max-age=0, must-revalidate' } });
  };
  const w = await import('../workers/aplayermode-com/src/index.js');
  const env = { CF_VERSION_METADATA: { id: 'worker-v1' } };
  const get = async (p) => { const r = await w.default.fetch(new Request('https://aplayermode.com' + p), env, { waitUntil() {} }); await r.text(); return r; };
  for (const p of ['/', '/aplayermode/aplayermode.css', '/robots.txt']) {
    assert.equal((await get(p)).headers.get(EDGE_CACHE_HEADER), 'MISS', p);
    assert.equal((await get(p)).headers.get(EDGE_CACHE_HEADER), 'HIT', p);
  }
  assert.equal((await get('/download')).status, 301);
  assert.equal((await get('/download')).headers.get(EDGE_CACHE_HEADER), null, 'a redirect is never cached');
  assert.equal((await get('/pinfeed.xml')).headers.get(EDGE_CACHE_HEADER), null, 'the feed is built per request, never cached');
  const pageFetches = originHits.filter((p) => p === '/aplayermode/').length;
  assert.equal(pageFetches, 1, 'second page request must not reach the origin');
  // A Pages deploy: once the build id is re-read, the old entry is never served.
  pagesBuild = 'pagesbuild-2';
  const later = Date.now() + (w.BUILD_ID_TTL_SECONDS + 1) * 1000;
  cache.store.delete(w.BUILD_ID_KEY);
  assert.equal(await w.pagesBuildId(cache, later), 'pagesbuild-2');
  assert.equal((await get('/')).headers.get(EDGE_CACHE_HEADER), 'MISS', 'new Pages build must miss');
});

test('Founding 100 count is never server-rendered into the cached page', () => {
  const page = fs.readFileSync(path.join(ROOT, 'aplayermode', 'index.html'), 'utf8');
  assert.match(page, /<p class="small" data-founding-left hidden><\/p>/, 'the "N of 100 left" slot must ship empty and be filled in the browser');
  assert.doesNotMatch(page, /\b\d{1,3} of 100 (left|places|spots)/i, 'a count baked into the HTML would be served stale from the edge cache');
  const app = fs.readFileSync(path.join(ROOT, 'aplayermode', 'app.js'), 'utf8');
  assert.match(app, /fetch\(links\.founding/, 'app.js must fetch the live count');
});
