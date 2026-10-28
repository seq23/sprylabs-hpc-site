#!/usr/bin/env node
/**
 * Post-deploy live check of the two public hosts (network; not part of the
 * offline validation matrix). Runs after Deploy Distribution:
 *   npm run check:sites-live
 *
 * Search Readiness checklist item h4: the build can pass and the edge can still
 * serve the wrong thing - a Worker that 301'd robots.txt did. Every validator in
 * this repository reads the committed tree; this one reads what the internet
 * gets, on both hosts, and it is the only check that can see a difference
 * between the two.
 *
 * What it refuses, per host:
 *   - a crawl file that is not 200 with the right content type
 *     (robots.txt, the host's sitemap index and child, llms.txt, llms-full.txt)
 *   - a missing icon or manifest (favicon.ico, apple-touch-icon.png,
 *     site.webmanifest) or an og image that is not 200
 *   - the IndexNow key file not answering with the key
 *   - a made-up path that does not 404 (a soft 404 hides every broken link)
 *   - www.<host> not 301-ing to <host> (one canonical host)
 *   - a landing page missing its canonical, its complete social card, the
 *     1200x630 og:image width/height pair, or its JSON-LD @graph types
 *   - a homepage the route-owner rule 301s (functions/_lib/route_owner_host.js)
 *     that does not 301 to its owner host
 *
 * Which page is a host's landing page is not hard-coded: it is read from the
 * same rule the edge runs (planHost below). Until 26 Oct 2026 this check
 * assumed every host's "/" answers 200; item a2 made https://spryexecutiveos.com/
 * a deliberate 301 to billionairehighperformancecoach.com, and Deploy
 * Distribution went red on a correct deploy (runs 40280677766, 40301109839,
 * 40305380597) because this file kept its own idea of the routes.
 * Guarded offline by tests/route_owner_host.test.mjs.
 *   - a measured redirect from _redirects that stops redirecting
 *
 * Bounded: every request has a 15 s timeout and its body is read or discarded,
 * so the check always ends.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { routeOwnerRedirect } from '../../functions/_lib/route_owner_host.js';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const { listIndexablePages } = require(path.join(ROOT, 'scripts/lib/site_pages.js'));
const { routeFor } = require(path.join(ROOT, 'scripts/lib/dual_domain_policy.cjs'));
const LABEL = '[check:sites-live]';
const HOSTS = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'config/site_hosts.json'), 'utf8')).hosts);
const CHILD = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/site_hosts.json'), 'utf8')).hosts;
const { DEFAULT_OG_IMAGE, OG_WIDTH, OG_HEIGHT } = require(path.join(ROOT, 'scripts/lib/social_tags.cjs'));
const INDEXNOW_KEY = fs.readFileSync(path.join(ROOT, 'indexnow.txt'), 'utf8').trim();

/** The @graph @types a page's JSON-LD declares. */
export function graphTypes(html) {
  return [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap((m) => { try { return JSON.parse(m[1])['@graph'] || []; } catch { return []; } })
    .flatMap((n) => [].concat(n['@type'] || []));
}

/** The href of a page's rel=canonical, or null. */
export function canonicalOf(html) {
  const tag = html.match(/<link[^>]*rel=["']canonical["'][^>]*>/i);
  const href = tag && tag[0].match(/href=["']([^"']+)["']/i);
  return href ? href[1] : null;
}

let routeFiles;
/** Committed file for a published route, from the same routeFor the build uses. */
function fileForRoute(route) {
  if (!routeFiles) {
    routeFiles = new Map();
    for (const rel of listIndexablePages(ROOT)) routeFiles.set(routeFor(rel), rel);
  }
  return routeFiles.get(route) || null;
}

/** Routes a host's own committed child sitemap claims, in order. */
function sitemapRoutes(host) {
  const xml = fs.readFileSync(path.join(ROOT, CHILD[host].child_sitemap), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1].trim()))
    .filter((u) => u.hostname === host)
    .map((u) => u.pathname);
}

/**
 * What the live check expects of a host, read from the committed tree and the
 * route-owner rule the edge runs - never from a list kept here.
 *   homeRedirect: where "/" must 301 to, or null when the host owns "/"
 *   landing: the page the metadata checks run on - "/" when the host owns it,
 *            otherwise the first route of its own sitemap the rule leaves alone
 */
export function planHost(host) {
  const base = `https://${host}`;
  const homeRedirect = routeOwnerRedirect(`${base}/`);
  const candidates = homeRedirect ? sitemapRoutes(host) : ['/'];
  const route = candidates.find((r) => !routeOwnerRedirect(`${base}${r}`) && fileForRoute(r));
  if (!route) throw new Error(`${LABEL} ${host}: no route this host owns has a committed page to check`);
  const rel = fileForRoute(route);
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const types = new Set(graphTypes(html));
  // The homepage's floor stays: it is the product page.
  if (route === '/') for (const t of ['WebPage', 'Product']) types.add(t);
  return {
    host,
    base,
    homeRedirect,
    landing: { route, rel, url: `${base}${route}`, canonical: canonicalOf(html), types: [...types].sort() },
  };
}

const failures = [];
const fail = (m) => failures.push(m);
let checked = 0;

async function get(url, { redirect = 'manual' } = {}) {
  checked += 1;
  try {
    const r = await fetch(url, {
      redirect,
      signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': 'Mozilla/5.0 (sprylabs-hpc-site live check)' },
    });
    const text = await r.text();
    return { status: r.status, headers: r.headers, text };
  } catch (e) {
    return { status: 0, headers: new Headers(), text: '', error: e.message };
  }
}

async function main() {
for (const host of HOSTS) {
  const plan = planHost(host);
  const base = plan.base;
  const files = [
    // Per host, robots.txt names that host's OWN child sitemap: Search Console
    // rejects a cross-host child (config/site_hosts.json).
    ['/robots.txt', /^text\/plain/, (t) => t.includes(`Sitemap: ${base}/${CHILD[host].child_sitemap}`) && !HOSTS.filter((h) => h !== host).some((h) => t.includes(CHILD[h].child_sitemap))],
    ['/sitemap.xml', /xml/, (t) => t.includes('<sitemapindex') && t.includes(CHILD[host].child_sitemap)],
    [`/${CHILD[host].child_sitemap}`, /xml/, (t) => t.includes('<loc>')],
    ['/llms.txt', /^text\/plain/, (t) => t.includes('/llms-full.txt')],
    ['/llms-full.txt', /^text\/plain/, (t) => t.length > 1000],
    ['/favicon.ico', /^image\//, null],
    ['/apple-touch-icon.png', /^image\/png/, null],
    ['/site.webmanifest', /manifest\+json|application\/json|text\/plain/, (t) => JSON.parse(t).icons.length > 0],
    [DEFAULT_OG_IMAGE[host], /^image\/png/, null],
    [`/${INDEXNOW_KEY}.txt`, /^text\/plain/, (t) => t.trim() === INDEXNOW_KEY],
  ];
  for (const [p, type, body] of files) {
    const r = await get(base + p);
    if (r.status !== 200) {
      fail(`${base}${p} answered ${r.status || `no response (${r.error})`}${r.headers.get('location') ? ` -> ${r.headers.get('location')}` : ''}; expected 200`);
      continue;
    }
    const ct = r.headers.get('content-type') || '';
    if (!type.test(ct)) fail(`${base}${p} content-type is "${ct}"`);
    if (body) {
      let ok = false;
      try { ok = body(r.text); } catch { ok = false; }
      if (!ok) fail(`${base}${p} body is not what the repository committed`);
    }
  }

  // A real 404. Every unknown path 301-ing home hides broken links from everyone.
  const missing = await get(`${base}/this-path-does-not-exist-live-check`);
  if (missing.status !== 404) fail(`${base}/this-path-does-not-exist-live-check answered ${missing.status}, not 404`);

  // One canonical host.
  const www = await get(`https://www.${host}/start-here`);
  if (www.status !== 301 || www.headers.get('location') !== `${base}/start-here`) {
    fail(`https://www.${host}/start-here must 301 to ${base}/start-here; got ${www.status} ${www.headers.get('location') || ''}`);
  }

  // The homepage. Where the route-owner rule sends "/" to its owner host, the
  // edge must do exactly that; the 200 checks then run on a page this host owns.
  if (plan.homeRedirect) {
    const r = await get(`${base}/`);
    if (r.status !== 301 || r.headers.get('location') !== plan.homeRedirect) {
      fail(`${base}/ must 301 to ${plan.homeRedirect} (functions/_lib/route_owner_host.js); got ${r.status} ${r.headers.get('location') || ''}`);
    }
  }

  // The landing page, as an engine sees it.
  const { url, canonical, types } = plan.landing;
  const home = await get(url);
  if (home.status !== 200) fail(`${url} answered ${home.status}${home.headers.get('location') ? ` -> ${home.headers.get('location')}` : ''}`);
  const html = home.text;
  if (/noindex/i.test(home.headers.get('x-robots-tag') || '')) fail(`${url} sends X-Robots-Tag: ${home.headers.get('x-robots-tag')}`);
  const liveCanonical = canonicalOf(html);
  if (!liveCanonical) fail(`${url} has no canonical link`);
  else if (canonical && liveCanonical !== canonical) fail(`${url} canonical is ${liveCanonical}; the repository committed ${canonical}`);
  for (const [attr, value] of [
    ['property', 'og:title'], ['property', 'og:description'], ['property', 'og:type'],
    ['property', 'og:url'], ['property', 'og:site_name'], ['property', 'og:image'],
    ['name', 'twitter:card'],
  ]) {
    if (!new RegExp(`${attr}=["']${value}["']`).test(html)) fail(`${url} lacks <meta ${attr}="${value}">`);
  }
  for (const [prop, value] of [['og:image:width', OG_WIDTH], ['og:image:height', OG_HEIGHT]]) {
    const m = html.match(new RegExp(`<meta[^>]*property=["']${prop}["'][^>]*content=["'](\\d+)["']|<meta[^>]*content=["'](\\d+)["'][^>]*property=["']${prop}["']`));
    const got = m && (m[1] || m[2]);
    if (String(got) !== String(value)) fail(`${url} ${prop} is ${got || 'absent'}, expected ${value}`);
  }
  const graph = graphTypes(html);
  if (!graph.length) fail(`${url} has no parseable JSON-LD @graph`);
  for (const t of types) if (!graph.includes(t)) fail(`${url} JSON-LD lacks ${t}`);
}

// A measured redirect: the first 301 the committed _redirects declares must
// still be a 301 at the edge.
const firstRedirect = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8')
  .split('\n').map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split(/\s+/))
  .find((p) => p.length === 3 && p[0].startsWith('/') && p[2] === '301');
if (!firstRedirect) fail('_redirects declares no 301 to measure; this check would prove nothing about redirects');
else {
  const [from, to] = firstRedirect;
  const r = await get(`https://${HOSTS[0]}${from}`);
  if (r.status !== 301 || !(r.headers.get('location') || '').endsWith(to)) {
    fail(`https://${HOSTS[0]}${from} must 301 to ${to}; got ${r.status} ${r.headers.get('location') || ''}`);
  }
}

if (!checked) {
  console.error(`${LABEL} FAIL: checked zero URLs.`);
  process.exit(1);
}
if (failures.length) {
  for (const f of failures) console.error(`${LABEL} FAIL ${f}`);
  console.error(`${LABEL} FAIL (${failures.length}) across ${checked} URLs on ${HOSTS.join(', ')}`);
  process.exit(1);
}
console.log(`${LABEL} PASS - ${checked} URLs on ${HOSTS.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
