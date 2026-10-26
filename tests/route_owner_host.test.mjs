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
