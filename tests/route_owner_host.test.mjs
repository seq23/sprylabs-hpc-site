// One 200 per route across the two shared hosts (Search Readiness item a2,
// 25 Oct 2026: https://spryexecutiveos.com/ answered 200 with rel=canonical
// pointing at billionairehighperformancecoach.com). Run: npm run validate:route-owner-host
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { routeOwnerRedirect, routeOwnerResponse, routeKeyFor, NEVER_REDIRECT_PREFIXES } from '../functions/_lib/route_owner_host.js';
import { BHPC_ROUTES, BHPC_HOST, SPRY_HOST } from '../functions/_lib/route_owner_table.js';
import { bhpcRoutes, render, canonicalHostOf } from '../scripts/build/build_route_owner_table.mjs';

const require_ = createRequire(import.meta.url);
const { listIndexablePages } = require_('../scripts/lib/site_pages.js');
const { routeFor } = require_('../scripts/lib/dual_domain_policy.cjs');
const ROOT = process.cwd();
const get = (url) => new Request(url);

test('the homepage, the defect this fixes, 301s off the spry host to its owner', () => {
  const res = routeOwnerResponse(get(`https://${SPRY_HOST}/`));
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), `https://${BHPC_HOST}/`);
});

test('a route the spry host owns is never redirected', () => {
  // Every spry-owned published route must answer where it is asked.
  let checked = 0;
  for (const rel of listIndexablePages(ROOT)) {
    const route = routeFor(rel);
    if (BHPC_ROUTES.has(route)) continue;
    assert.equal(routeOwnerRedirect(`https://${SPRY_HOST}${route}`), null, `${route} is spry-owned and must not redirect`);
    checked += 1;
  }
  assert.ok(checked > 100, `expected the spry surface, checked ${checked}`);
});

test('every BHPC-owned route 301s off the spry host, path intact', () => {
  let checked = 0;
  for (const route of BHPC_ROUTES) {
    if (NEVER_REDIRECT_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`))) continue;
    assert.equal(routeOwnerRedirect(`https://${SPRY_HOST}${route}`), `https://${BHPC_HOST}${route}`, route);
    checked += 1;
  }
  assert.ok(checked > 1000, `expected the product surface, checked ${checked}`);
});

test('the query string survives, and the redirect is a cacheable 301 with no body', async () => {
  assert.equal(
    routeOwnerRedirect(`https://${SPRY_HOST}/faq?utm_source=x&a=b%20c`),
    `https://${BHPC_HOST}/faq?utm_source=x&a=b%20c`,
  );
  const res = routeOwnerResponse(get(`https://${SPRY_HOST}/`));
  assert.match(res.headers.get('cache-control'), /max-age=\d+/);
  assert.equal(await res.text(), '');
});

test('an unknown path is passed through, so it still answers a real 404', () => {
  // Item a9 requires a made-up path to 404 rather than redirect.
  for (const p of ['/definitely-not-a-real-path-zzz', '/faq/not-a-page', '/answers/nope-zzz']) {
    assert.equal(routeOwnerRedirect(`https://${SPRY_HOST}${p}`), null, p);
  }
});

test('the other host, previews and unknown hosts are never redirected', () => {
  for (const url of [
    `https://${BHPC_HOST}/`,
    `https://${BHPC_HOST}/insights/create-calm-urgency`,
    'https://sprylabs-hpc-site.pages.dev/',
    'https://abc123.sprylabs-hpc-site.pages.dev/faq',
    'https://aplayermode.com/',
    'https://www.example.com/faq',
  ]) assert.equal(routeOwnerRedirect(url), null, url);
});

test('files and crawl surfaces are served per host, never redirected', () => {
  for (const p of ['/robots.txt', '/sitemap.xml', '/sitemap-spry.xml', '/sitemap-bhpc.xml', '/llms.txt', '/llms-full.txt', '/favicon.ico', '/site.webmanifest', '/apple-touch-icon.png', '/assets/styles.css', '/feed.xml']) {
    assert.equal(routeOwnerRedirect(`https://${SPRY_HOST}${p}`), null, p);
  }
});

test('the operator surfaces and aplayermode are left alone', () => {
  for (const p of ['/admin', '/admin/', '/admin/status', '/agency', '/agency/', '/api/admin/session', '/cdn-cgi/trace', '/aplayermode', '/aplayermode/']) {
    assert.equal(routeOwnerRedirect(`https://${SPRY_HOST}${p}`), null, p);
  }
});

test('the .html form resolves to the same route as the clean URL', () => {
  assert.equal(routeKeyFor('/download.html'), '/download');
  assert.equal(routeKeyFor('/'), '/');
  assert.equal(routeKeyFor('/answers/'), '/answers/');
  if (BHPC_ROUTES.has('/download')) {
    assert.equal(routeOwnerRedirect(`https://${SPRY_HOST}/download.html`), `https://${BHPC_HOST}/download.html`);
  }
});

test('the committed table is exactly what the generator derives from the canonicals', () => {
  // The table is generated, so a hand edit, a stale commit or a page whose
  // canonical moved must all show up here rather than at the edge.
  const data = bhpcRoutes(ROOT);
  const want = render(data);
  const have = fs.readFileSync(path.join(ROOT, 'functions/_lib/route_owner_table.js'), 'utf8');
  assert.equal(have, want, 'functions/_lib/route_owner_table.js is stale; run npm run build:route-owner-table');
  assert.ok(data.routes.length > 1000, `expected the product surface, derived ${data.routes.length}`);
});

test('the table agrees with every page\'s own rel=canonical', () => {
  // Rule 0 and the real proof: the edge must send a route to the host the page
  // itself declares. Checked against the committed tree, page by page.
  let checked = 0;
  for (const rel of listIndexablePages(ROOT)) {
    const host = canonicalHostOf(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    if (host !== BHPC_HOST && host !== SPRY_HOST) continue;
    const route = routeFor(rel);
    const redirect = routeOwnerRedirect(`https://${SPRY_HOST}${route}`);
    const skipped = NEVER_REDIRECT_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`)) || !(!route.split('/').pop().includes('.') || /\.html?$/i.test(route));
    if (skipped) { checked += 1; continue; }
    if (host === BHPC_HOST) assert.equal(redirect, `https://${BHPC_HOST}${route}`, `${rel} declares ${host} but the edge does not send it there`);
    else assert.equal(redirect, null, `${rel} declares ${host} but the edge redirects it away`);
    checked += 1;
  }
  assert.ok(checked > 2000, `expected the whole published surface, checked ${checked}`);
});

// The post-deploy live check (scripts/diagnostics/check_sites_live.mjs) is a
// consumer of this rule. Until 26 Oct 2026 it kept its own assumption that every
// host's "/" answers 200, so the correct a2 deploy turned Deploy Distribution red
// (runs 40280677766, 40301109839, 40305380597). Its expectations now come from
// planHost(), which reads this rule; these tests hold it to that.
test('the live check expects exactly what the route-owner rule does, on every host', async () => {
  const { planHost } = await import('../scripts/diagnostics/check_sites_live.mjs');
  const hosts = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'config/site_hosts.json'), 'utf8')).hosts);
  assert.ok(hosts.length >= 2, `expected both shared hosts, found ${hosts.length}`);
  let checked = 0;
  for (const host of hosts) {
    const plan = planHost(host);
    // "/" is either owned (no redirect expected) or expected to 301 exactly where the edge sends it.
    assert.equal(plan.homeRedirect, routeOwnerRedirect(`https://${host}/`), `${host}: home expectation drifted from the rule`);
    // The 200 checks never run on a route the edge redirects.
    assert.equal(routeOwnerRedirect(plan.landing.url), null, `${host}: landing ${plan.landing.url} is a route the edge 301s`);
    // The page checked is one this host's canonical claims, with types to hold it to.
    assert.equal(new URL(plan.landing.canonical).hostname, host, `${host}: landing canonical ${plan.landing.canonical} is on another host`);
    assert.ok(plan.landing.types.length > 0, `${host}: landing ${plan.landing.route} declares no JSON-LD types to check`);
    checked += 1;
  }
  assert.equal(checked, hosts.length);
});

test('the spry host is planned as a 301 home plus a spry-owned landing page', async () => {
  const { planHost } = await import('../scripts/diagnostics/check_sites_live.mjs');
  const plan = planHost(SPRY_HOST);
  assert.equal(plan.homeRedirect, `https://${BHPC_HOST}/`);
  assert.notEqual(plan.landing.route, '/');
  assert.equal(BHPC_ROUTES.has(plan.landing.route), false);
  const bhpc = planHost(BHPC_HOST);
  assert.equal(bhpc.homeRedirect, null);
  assert.equal(bhpc.landing.route, '/');
  for (const t of ['WebPage', 'Product']) assert.ok(bhpc.landing.types.includes(t), `BHPC homepage floor lacks ${t}`);
});
