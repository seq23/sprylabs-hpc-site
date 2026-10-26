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
 *   - a homepage missing its canonical, its complete social card, the
 *     1200x630 og:image width/height pair, or its JSON-LD @graph types
 *   - a measured redirect from _redirects that stops redirecting
 *
 * Bounded: every request has a 15 s timeout and its body is read or discarded,
 * so the check always ends.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { routeOwnerRedirect } from '../../functions/_lib/route_owner_host.js';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const LABEL = '[check:sites-live]';
const HOSTS = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'config/site_hosts.json'), 'utf8')).hosts);
const CHILD = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/site_hosts.json'), 'utf8')).hosts;
const { DEFAULT_OG_IMAGE, OG_WIDTH, OG_HEIGHT } = require(path.join(ROOT, 'scripts/lib/social_tags.cjs'));
const INDEXNOW_KEY = fs.readFileSync(path.join(ROOT, 'indexnow.txt'), 'utf8').trim();

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

for (const host of HOSTS) {
  const base = `https://${host}`;
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

  // The homepage, as an engine sees it. Where the route-owner table gives "/"
  // to the other host (spryexecutiveos.com since #153, Search Readiness a2),
  // the only correct answer is a 301 to exactly that owner URL - a 200 there
  // is the duplicate #153 removed, and the owner's homepage is checked in its
  // own iteration. Until 26 Oct 2026 this demanded a 200 on both hosts, so
  // Deploy Distribution went red on every main commit after #153.
  const ownerHome = routeOwnerRedirect(`${base}/`);
  if (ownerHome) {
    const r = await get(`${base}/`);
    if (r.status !== 301 || r.headers.get('location') !== ownerHome) {
      fail(`${base}/ must 301 to its route owner ${ownerHome}; got ${r.status} ${r.headers.get('location') || ''}`);
    }
    continue;
  }
  const home = await get(`${base}/`);
  if (home.status !== 200) fail(`${base}/ answered ${home.status}`);
  const html = home.text;
  if (/noindex/i.test(home.headers.get('x-robots-tag') || '')) fail(`${base}/ sends X-Robots-Tag: ${home.headers.get('x-robots-tag')}`);
  if (!new RegExp(`rel=["']canonical["']`).test(html)) fail(`${base}/ has no canonical link`);
  for (const [attr, value] of [
    ['property', 'og:title'], ['property', 'og:description'], ['property', 'og:type'],
    ['property', 'og:url'], ['property', 'og:site_name'], ['property', 'og:image'],
    ['name', 'twitter:card'],
  ]) {
    if (!new RegExp(`${attr}=["']${value}["']`).test(html)) fail(`${base}/ lacks <meta ${attr}="${value}">`);
  }
  for (const [prop, value] of [['og:image:width', OG_WIDTH], ['og:image:height', OG_HEIGHT]]) {
    const m = html.match(new RegExp(`<meta[^>]*property=["']${prop}["'][^>]*content=["'](\\d+)["']|<meta[^>]*content=["'](\\d+)["'][^>]*property=["']${prop}["']`));
    const got = m && (m[1] || m[2]);
    if (String(got) !== String(value)) fail(`${base}/ ${prop} is ${got || 'absent'}, expected ${value}`);
  }
  const graph = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap((m) => { try { return JSON.parse(m[1])['@graph'] || []; } catch { return []; } })
    .flatMap((n) => [].concat(n['@type'] || []));
  if (!graph.length) fail(`${base}/ has no parseable JSON-LD @graph`);
  for (const t of ['WebPage', 'Product']) if (!graph.includes(t)) fail(`${base}/ JSON-LD lacks ${t}`);
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
