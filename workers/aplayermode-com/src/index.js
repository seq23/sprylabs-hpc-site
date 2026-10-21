/**
 * aplayermode.com: serves the A Player Mode landing page at the apex.
 *
 * Owner, 8 Oct 2026: "keep the download page but move aplayermode.com
 * entirely". The page source lives in this repo at aplayermode/ and ships with
 * the sprylabs-hpc-site Pages project; this Worker (route aplayermode.com/*)
 * serves it at https://aplayermode.com/ so the address bar never shows the
 * BHPC domain.
 *
 *   /                      -> the page (fetched from the Pages origin)
 *   /aplayermode/<file>    -> the page's own files (CSS, JS, config.js, images)
 *   SHARED_ASSETS          -> the few site-wide files the page also loads
 *   ROOT_FILES             -> the domain's own crawl files (robots.txt,
 *                             sitemap.xml, llms.txt, site.webmanifest,
 *                             apple-touch-icon.png), committed under aplayermode/
 *                             and fetched from the Pages origin like any asset
 *                             (indexable since 10 Oct 2026, owner), and the
 *                             domain's own IndexNow key file /<INDEXNOW_KEY>.txt
 *                             (aplayermode/<key>.txt; its own key, so it is valid
 *                             on aplayermode.com only; distribution.config.json
 *                             indexnow.host_keys, submitted on every distribution
 *                             deploy; 16 Oct 2026)
 *   /pinfeed.xml           -> the Pinterest RSS feed, built HERE at request time
 *                             (./pinqueue.js buildPinfeedXml) from
 *                             aplayermode/data/pinterest/queue.json on the Pages
 *                             origin: the 5 launch items plus every drip variant
 *                             whose release_date <= today in America/Chicago,
 *                             newest 50. A new pin appears each day with no deploy,
 *                             and the weekly refill reaches it once Pages publishes.
 *                             application/rss+xml; /pinfeed and /pinfeed/ 301 to it.
 *                             Guarded by validate_aplayermode_pinterest.mjs.
 *   PIN_VISITS             -> a page request carrying utm_source=pinterest writes
 *                             one Analytics Engine data point (utm_content, campaign,
 *                             medium; no IP, no user agent, no cookie), skipping
 *                             crawlers. Read weekly by
 *                             scripts/aplayermode/collect_pin_metrics.mjs.
 *   /aplayermode/          -> 301 to / (one URL per page)
 *   /amazon/*              -> 301 to billionairehighperformancecoach.com/amazon/*
 *                             (zone Redirect Rule b4d8a48c answers first; this
 *                             mirrors it so the contract holds without the rule)
 *   anything else          -> 301 to /, so no other BHPC page is exposed here.
 *
 * LOOP GUARD: ORIGIN is the Pages project's own pages.dev host, never
 * billionairehighperformancecoach.com, whose /aplayermode/ now 301s here
 * (functions/aplayermode/index.js). An origin redirect is never followed; it is
 * answered 502 so a misconfiguration fails loudly instead of looping.
 *
 * EDGE CACHE (21 Oct 2026): the page and its files are answered from
 * caches.default (functions/_lib/edge_cache.js, x-edge-cache: HIT|MISS|BYPASS)
 * instead of a pages.dev round trip on every request. The key carries the Pages
 * build id (ORIGIN/build-id.txt, stamped by scripts/assemble_pages_output.js,
 * re-read at most once a minute) and this Worker's own version id, so a Pages
 * deploy is picked up within BUILD_ID_TTL_SECONDS and a Worker deploy at once.
 * The feed, redirects and anything non-200 are never cached.
 *
 * Deploy: npx wrangler deploy --config workers/aplayermode-com/wrangler.jsonc
 * Guarded by scripts/validators/validate_aplayermode_landing.mjs and
 * tests/edge_cache.test.mjs.
 */
import { buildPinfeedXml, chicagoDate } from './pinqueue.js';
import { serveWithEdgeCache } from '../../../functions/_lib/edge_cache.js';

export const ORIGIN = 'https://sprylabs-hpc-site.pages.dev';
export const PAGE_PATH = '/aplayermode/';
export const BHPC = 'https://billionairehighperformancecoach.com';
// Site-wide files the landing page loads from outside /aplayermode/.
export const SHARED_ASSETS = new Set([
  '/favicon.ico',
  '/assets/domain-context.js',
  '/assets/img/os-system-image.png',
  '/assets/img/manual-preview-mobile-1.webp',
  '/assets/img/manual-preview-mobile-2.webp',
  '/assets/img/manual-preview-mobile-3.webp',
  '/assets/img/manual-preview-mobile-4.webp',
  '/assets/img/manual-preview-mobile-5.webp',
]);

// aplayermode.com's own IndexNow key (distribution.config.json indexnow.host_keys).
export const INDEXNOW_KEY = '1cf2f6839abec33933cb3e6ea81027b8';

// aplayermode.com's own root-level crawl and icon files, served from aplayermode/.
export const ROOT_FILES = Object.freeze({
  [`/${INDEXNOW_KEY}.txt`]: `/aplayermode/${INDEXNOW_KEY}.txt`,
  '/robots.txt': '/aplayermode/robots.txt',
  '/sitemap.xml': '/aplayermode/sitemap.xml',
  '/llms.txt': '/aplayermode/llms.txt',
  '/site.webmanifest': '/aplayermode/site.webmanifest',
  '/apple-touch-icon.png': '/aplayermode/img/apple-touch-icon.png',
});

export const FEED_PATH = '/pinfeed.xml';
export const QUEUE_PATH = '/aplayermode/data/pinterest/queue.json';
export const FEED_TYPE = 'application/rss+xml; charset=utf-8';
// Crawlers (Pinterest's own included) never count as a Pinterest-referred visit.
const BOT_UA = /bot|crawl|spider|slurp|preview|pinterest|facebookexternalhit|headless|lighthouse/i;

/** Pure routing decision, exported for the validator. */
export function route(pathname) {
  if (pathname === '/' || pathname === '/index.html') return { kind: 'page', upstream: PAGE_PATH };
  if (pathname === FEED_PATH) return { kind: 'feed', upstream: QUEUE_PATH };
  if (pathname === '/amazon' || pathname.startsWith('/amazon/')) return { kind: 'redirect', location: BHPC + pathname, keepQuery: true };
  if (pathname === '/pinfeed' || pathname === '/pinfeed/') return { kind: 'redirect', location: FEED_PATH, keepQuery: false };
  if (pathname === '/aplayermode' || pathname === PAGE_PATH || pathname === `${PAGE_PATH}index.html`) return { kind: 'redirect', location: '/', keepQuery: true };
  if (pathname.startsWith(PAGE_PATH) && !pathname.includes('..')) return { kind: 'asset', upstream: pathname };
  if (SHARED_ASSETS.has(pathname)) return { kind: 'asset', upstream: pathname };
  if (Object.prototype.hasOwnProperty.call(ROOT_FILES, pathname)) return { kind: 'asset', upstream: ROOT_FILES[pathname] };
  return { kind: 'redirect', location: '/', keepQuery: false };
}

/** One data point per Pinterest-referred page view: utm values only, never IP/UA/cookies. */
export function pinVisitPoint(url, userAgent) {
  if (url.searchParams.get('utm_source') !== 'pinterest' || BOT_UA.test(userAgent || '')) return null;
  const clip = (v) => String(v || '').slice(0, 96);
  const content = clip(url.searchParams.get('utm_content')) || '(none)';
  return { indexes: [content], blobs: [content, clip(url.searchParams.get('utm_campaign')), clip(url.searchParams.get('utm_medium'))], doubles: [1] };
}

async function serveFeed(request, upstreamPath) {
  const upstream = await fetch(ORIGIN + upstreamPath, { headers: { accept: 'application/json' }, redirect: 'manual', cf: { cacheTtl: 300 } });
  if (upstream.status !== 200) return new Response(`pin queue unavailable (origin ${upstream.status})`, { status: 502 });
  const xml = buildPinfeedXml(await upstream.json(), chicagoDate(new Date()));
  return new Response(request.method === 'HEAD' ? null : xml, { status: 200, headers: { 'content-type': FEED_TYPE, 'cache-control': 'public, max-age=900' } });
}

export const BUILD_ID_PATH = '/build-id.txt';
export const BUILD_ID_TTL_SECONDS = 60;
const BUILD_ID_KEY = 'https://aplayermode.com/__edge/pages-build-id';
let memoBuild = { id: '', at: 0 };

/** The Pages build id, from memory, then the edge cache, then the origin (max BUILD_ID_TTL_SECONDS old). '' = unknown = no caching. */
export async function pagesBuildId(cache, now = Date.now()) {
  if (memoBuild.id && now - memoBuild.at < BUILD_ID_TTL_SECONDS * 1000) return memoBuild.id;
  try {
    const cached = cache ? await cache.match(BUILD_ID_KEY) : null;
    if (cached) { memoBuild = { id: (await cached.text()).trim(), at: now }; return memoBuild.id; }
  } catch { /* fall through to the origin */ }
  try {
    const res = await fetch(ORIGIN + BUILD_ID_PATH, { redirect: 'manual' });
    const id = res.status === 200 ? (await res.text()).trim() : '';
    if (!/^[\w.-]{4,80}$/.test(id)) return '';
    memoBuild = { id, at: now };
    if (cache) await cache.put(BUILD_ID_KEY, new Response(id, { headers: { 'cache-control': `public, max-age=${BUILD_ID_TTL_SECONDS}` } })).catch(() => {});
    return id;
  } catch { return ''; }
}

const FORWARD_HEADERS = ['accept', 'accept-encoding', 'accept-language', 'if-none-match', 'if-modified-since', 'range', 'user-agent'];

export default {
  async fetch(request, env = {}, ctx = {}) {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const r = route(url.pathname);
    if (r.kind === 'redirect') {
      const target = new URL(r.location, url);
      if (r.keepQuery) target.search = url.search;
      return new Response(null, { status: 301, headers: { Location: target.toString(), 'Cache-Control': 'public, max-age=3600' } });
    }
    if (r.kind === 'feed') return serveFeed(request, r.upstream);
    if (r.kind === 'page' && env.PIN_VISITS) {
      const point = pinVisitPoint(url, request.headers.get('user-agent'));
      if (point) { try { env.PIN_VISITS.writeDataPoint(point); } catch { /* measurement never breaks the page */ } }
    }
    const fetchOrigin = async () => {
      const headers = new Headers();
      for (const h of FORWARD_HEADERS) { const v = request.headers.get(h); if (v) headers.set(h, v); }
      const upstream = await fetch(ORIGIN + r.upstream + url.search, { method: request.method, headers, redirect: 'manual' });
      if (upstream.status >= 300 && upstream.status < 400 && upstream.status !== 304) {
        return new Response(`origin redirected ${r.upstream} (status ${upstream.status}); refusing to follow`, { status: 502 });
      }
      const out = new Response(upstream.body, upstream);
      out.headers.delete('location');
      return out;
    };
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const pagesBuild = request.method === 'GET' ? await pagesBuildId(cache) : '';
    const workerVersion = (env.CF_VERSION_METADATA && env.CF_VERSION_METADATA.id) || 'v0';
    return serveWithEdgeCache({
      request,
      buildId: pagesBuild ? `${pagesBuild}.${workerVersion}` : '',
      cache,
      waitUntil: typeof ctx.waitUntil === 'function' ? (p) => ctx.waitUntil(p) : null,
      fetchOrigin,
      htmlOnly: false,
    });
  },
};
