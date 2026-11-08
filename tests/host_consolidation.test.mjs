// Brief 5 (portfolio check, 25 Oct 2026): ai-executive-coach goes to bhpc.
// Four spryexecutiveos.com pages 301 to their bhpc equivalents on both shared
// hosts and are listed in no sitemap. Run: npm run validate:host-consolidation
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { keepers } = require('../scripts/lib/spry_rescue.cjs');
const { isNoindex } = require('../scripts/lib/site_pages.js');
const { routeOwnerRedirect } = await import('../functions/_lib/route_owner_host.js');
import { CONSOLIDATED_ROUTES, consolidationRedirect, consolidationResponse } from '../functions/_lib/host_consolidation.js';
import { onRequest } from '../functions/_middleware.js';

const BHPC = 'billionairehighperformancecoach.com';
const SPRY = 'spryexecutiveos.com';
const hosts = JSON.parse(fs.readFileSync('config/site_hosts.json', 'utf8')).hosts;

test('the four routes named in Brief 5 are the table, no more and no fewer', () => {
  assert.deepEqual([...CONSOLIDATED_ROUTES.keys()].sort(), [
    '/ai-executive-coach-alternative-for-high-performers',
    '/ai-executive-coach/',
    '/answers/ai-executive-coach-alternative',
    '/clusters/ai-executive-coaching',
  ]);
});

test('each route 301s to its bhpc target from both hosts, .html form included, query kept', () => {
  for (const [route, target] of CONSOLIDATED_ROUTES) {
    assert.ok(target.startsWith(`https://${BHPC}/`), `${route} must land on bhpc`);
    for (const host of [SPRY, BHPC]) {
      const forms = route.endsWith('/') ? [route] : [route, `${route}.html`];
      for (const p of forms) {
        const res = consolidationResponse(new Request(`https://${host}${p}?utm_source=x`));
        assert.ok(res, `${host}${p} must redirect`);
        assert.equal(res.status, 301);
        assert.equal(res.headers.get('location'), `${target}?utm_source=x`);
      }
    }
  }
});

test('no target is itself consolidated (one hop, never a loop), and every target page exists', () => {
  for (const target of CONSOLIDATED_ROUTES.values()) {
    const p = new URL(target).pathname;
    assert.equal(consolidationRedirect(target), null, `${target} must answer, not redirect`);
    const rel = p.replace(/^\//, '');
    assert.ok(fs.existsSync(`${rel}.html`) || fs.existsSync(`${rel}/index.html`), `${target} has no page file`);
  }
});

test('the bare /ai-executive-coach target is not caught by the /ai-executive-coach/ rule', () => {
  assert.equal(consolidationRedirect(`https://${SPRY}/ai-executive-coach`), null);
  assert.equal(consolidationRedirect(`https://${BHPC}/ai-executive-coach`), null);
});

test('previews and unknown hosts are passed through', () => {
  assert.equal(consolidationRedirect('https://abc123.sprylabs-hpc-site.pages.dev/ai-executive-coach/'), null);
  assert.equal(consolidationRedirect('https://example.com/ai-executive-coach/'), null);
});

test('the middleware answers the 301 before anything else serves the page', async () => {
  const res = await onRequest({ request: new Request(`https://${SPRY}/clusters/ai-executive-coaching`), next: () => { throw new Error('page served'); }, waitUntil() {} });
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), `https://${BHPC}/synthesis-ai-executive-coaching`);
});

test('no sitemap lists a consolidated route, and each host lists only its own URLs', () => {
  let urls = 0;
  for (const [host, { child_sitemap: file }] of Object.entries(hosts)) {
    const locs = [...fs.readFileSync(file, 'utf8').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => new URL(m[1]));
    assert.ok(locs.length > 0, `${file} lists zero URLs`);
    assert.equal(new Set(locs.map(u => u.href)).size, locs.length, `${file} duplicates a URL`);
    if (host === SPRY) assert.deepEqual(locs.map(u => u.pathname).sort(), [...keepers].sort());
    else assert.ok(locs.length > 100, `${file}: product-host population unexpectedly shrank`);
    urls += locs.length;
    for (const u of locs) {
      const rel = u.pathname === '/' ? 'index.html' : u.pathname.endsWith('/') ? u.pathname.slice(1) + 'index.html' : u.pathname.slice(1) + '.html';
      assert.ok(fs.existsSync(rel), `${u.href} has no built page`);
      const html = fs.readFileSync(rel, 'utf8');
      assert.equal(isNoindex(html), false, `${u.href} is noindex`);
      assert.equal(html.match(/<link\b(?=[^>]*rel=["']canonical["'])[^>]*href=["']([^"']+)/)?.[1], u.href, `${u.href} canonical differs`);
      assert.equal(routeOwnerRedirect(u.href), null, `${u.href} redirects off its advertised host`);
      assert.equal(consolidationRedirect(u.href), null);
      assert.equal(u.hostname, host, `${file} lists ${u.href}, another host's URL`);
      assert.ok(!CONSOLIDATED_ROUTES.has(u.pathname.replace(/\.html$/, '')), `${file} still lists ${u.href}, which 301s`);
    }
  }
  assert.ok(urls > 0);
});

test('the edge table is exactly config/host_consolidations.json, and none of its pages is citable', () => {
  const cfg = JSON.parse(fs.readFileSync('config/host_consolidations.json', 'utf8')).routes;
  assert.deepEqual(new Map(cfg.map((r) => [r.from, r.to])), new Map(CONSOLIDATED_ROUTES));
  const rows = new Map(JSON.parse(fs.readFileSync('data/citation/citable_pages.json', 'utf8')).pages.map((p) => [p.path, p]));
  for (const r of cfg) {
    assert.ok(fs.existsSync(r.source_file), `${r.source_file} is not in the tree`);
    assert.equal(rows.get(r.source_file)?.status, 'EXCLUDED', `${r.source_file} is still a citable page, so a sitemap writer will list it again`);
  }
});

// 8 Nov 2026 fold: every page folded into a hub (manual_redirects.json, served_by "edge") is gone
// from the tree and every sitemap, and 301s in every request form on both hosts, in one hop, to a
// page that is still published and is not itself redirected.
test('every folded page 301s to a live hub page on both hosts, in one hop, and is listed nowhere', async () => {
  const { FOLDED_ROUTES } = await import('../functions/_lib/fold_table.js');
  const { foldPairs } = await import('../scripts/content/build_fold_table.mjs');
  const folded = JSON.parse(fs.readFileSync('data/content/manual_redirects.json', 'utf8')).redirects.filter((r) => r.served_by === 'edge');
  assert.ok(folded.length > 0, 'no folded page in manual_redirects.json: nothing to check');
  assert.deepEqual([...FOLDED_ROUTES], foldPairs(folded), 'functions/_lib/fold_table.js is out of date');
  const maps = [fs.readFileSync('sitemap-bhpc.xml', 'utf8'), fs.readFileSync('sitemap-spry.xml', 'utf8')].join('\n');
  for (const r0 of folded) {
    const r = { ...r0, target: new URL(r0.target, `https://${r0.domain}`).href };
    assert.equal(r0.domain, BHPC, `${r0.source_path}: folded onto another host`);
    assert.ok(!fs.existsSync(r.source_path), `${r.source_path}: still in the tree`);
    const t = new URL(r.target);
    const file = t.pathname === '/' ? 'index.html' : t.pathname.endsWith('/') ? `${t.pathname.slice(1)}index.html` : `${t.pathname.slice(1)}.html`;
    assert.ok(fs.existsSync(file) || fs.existsSync(t.pathname.slice(1) + '/index.html'), `${r.source_path}: target ${r.target} has no page`);
    assert.equal(consolidationRedirect(r.target), null, `${r.target}: the target itself redirects (a chain)`);
    const p = '/' + r.source_path;
    const forms = p.endsWith('/index.html') ? [p.slice(0, -10), p.slice(0, -11), p] : [p, p.replace(/\.html$/, '')];
    for (const host of [BHPC, SPRY]) for (const f of forms) {
      const res = consolidationResponse(new Request(`https://${host}${f}?utm_source=x`));
      assert.ok(res, `${host}${f} must redirect`);
      assert.equal(res.status, 301);
      assert.equal(res.headers.get('location'), `${r.target}?utm_source=x`);
    }
    assert.ok(!maps.includes(`<loc>https://${BHPC}/${r.source_path.replace(/index\.html$/, '').replace(/\.html$/, '')}</loc>`), `${r.source_path}: still in a sitemap`);
  }
});
