// Brief 5 (portfolio check, 25 Oct 2026): ai-executive-coach goes to bhpc.
// Four spryexecutiveos.com pages 301 to their bhpc equivalents on both shared
// hosts and are listed in no sitemap. Run: npm run validate:host-consolidation
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
    assert.ok(locs.length > 100, `${file} lists ${locs.length} URLs`);
    urls += locs.length;
    for (const u of locs) {
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
