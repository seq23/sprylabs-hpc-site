/**
 * Edge HTML cache (21 Oct 2026, owner: "make the pages fast").
 *
 * Every page on billionairehighperformancecoach.com, spryexecutiveos.com and
 * aplayermode.com came back `cf-cache-status: DYNAMIC`: the Pages project serves
 * them from its asset store on every request, and the aplayermode.com Worker
 * fetched the page from sprylabs-hpc-site.pages.dev on every request (a second
 * full hop). Nothing was ever answered from the edge.
 *
 * This module is the one definition both entry points use:
 *   functions/_middleware.js            (Pages: BHPC + spryexecutiveos, HTML only)
 *   workers/aplayermode-com/src/index.js (the aplayermode.com page and its files)
 *
 * The Cache API entry is keyed per host + path + BUILD id, so a deploy never
 * serves a stale page: the new build looks under new keys and the old entries
 * simply age out. With no build id the cache is bypassed (fail safe, and the
 * `x-edge-cache: BYPASS` header makes that visible instead of silent).
 *
 * Never cached: anything but GET, /api, admin, checkout/billing/sign-up/login,
 * forms, redirects or any non-200, responses that set a cookie or say
 * no-store/private, requests carrying Authorization or the admin session cookie,
 * and URLs with a query parameter other than plain campaign tags (utm_*, gclid,
 * fbclid...), which static pages ignore. The Founding 100 "N of 100 left" count
 * is fetched by the browser from the app (aplayermode/app.js, APM_LINKS.founding),
 * so a cached page can never show a stale count.
 *
 * Guarded by tests/edge_cache.test.mjs (npm run validate:edge-cache).
 */
export const EDGE_CACHE_HEADER = 'x-edge-cache';
/** How long an entry lives at the edge. Safe to be long: the build id is in the key. */
export const EDGE_TTL_SECONDS = 86400;
const ORIGIN_CC_HEADER = 'x-origin-cache-control';

/** Path prefixes that are never cached, on any host. Lower-case, compared case-insensitively. */
export const NEVER_CACHE_PREFIXES = Object.freeze([
  '/api/', '/admin', '/cdn-cgi/', '/functions/',
  '/checkout', '/billing', '/pay', '/stripe', '/gumroad', '/buy',
  '/join', '/signup', '/sign-up', '/register', '/login', '/logout', '/account', '/auth',
  '/subscribe', '/unsubscribe', '/contact', '/form', '/lead',
]);

/** Query parameters that never change a static page; anything else bypasses the cache. */
const TRACKING_PARAM = /^(utm_[a-z_]+|gclid|gbraid|wbraid|fbclid|msclkid|ttclid|twclid|li_fat_id|mc_cid|mc_eid|ref|_gl)$/i;

/** True when the request may be answered from (and stored to) the edge cache. */
export function isCacheableRequest(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase();
  if (NEVER_CACHE_PREFIXES.some((p) => path === p.replace(/\/$/, '') || path.startsWith(p))) return false;
  for (const key of url.searchParams.keys()) if (!TRACKING_PARAM.test(key)) return false;
  if (request.headers.get('authorization')) return false;
  if (/(?:^|;\s*)spry_admin=/.test(request.headers.get('cookie') || '')) return false;
  return true;
}

/** True for a path that names a page (no file extension, or .html) rather than a file. */
export function isPagePath(pathname) {
  const last = pathname.split('/').pop() || '';
  return !last.includes('.') || /\.html?$/i.test(last);
}

/** True when the origin's answer may be stored. `htmlOnly` limits it to pages. */
export function isCacheableResponse(response, { htmlOnly = true } = {}) {
  if (response.status !== 200) return false;
  if (response.headers.has('set-cookie')) return false;
  const cc = (response.headers.get('cache-control') || '').toLowerCase();
  if (/\b(no-store|private)\b/.test(cc)) return false;
  if (htmlOnly && !/^text\/html\b/i.test(response.headers.get('content-type') || '')) return false;
  return true;
}

/** The Cache API key: host + path + build, never the visitor's query string. */
export function cacheKey(requestUrl, buildId) {
  const url = new URL(requestUrl);
  return new Request(`https://${url.host.toLowerCase()}${url.pathname}?__edge_build=${encodeURIComponent(buildId)}`, { method: 'GET' });
}

function tagged(response, state) {
  const out = new Response(response.body, response);
  out.headers.set(EDGE_CACHE_HEADER, state);
  return out;
}

/**
 * Answer `request` from the edge cache, or from `fetchOrigin()` and store it.
 * Returns the response with `x-edge-cache: HIT | MISS | BYPASS`.
 */
export async function serveWithEdgeCache({ request, buildId, cache, waitUntil, fetchOrigin, htmlOnly = true }) {
  if (!buildId || !cache || !isCacheableRequest(request)) return tagged(await fetchOrigin(), 'BYPASS');
  const key = cacheKey(request.url, buildId);
  let hit = null;
  try { hit = await cache.match(key); } catch { hit = null; }
  if (hit) {
    const out = tagged(hit, 'HIT');
    // The browser keeps the origin's own Cache-Control (revalidate every visit);
    // only the edge copy carries the long lifetime.
    const originCc = out.headers.get(ORIGIN_CC_HEADER);
    out.headers.delete(ORIGIN_CC_HEADER);
    if (originCc) out.headers.set('cache-control', originCc); else out.headers.delete('cache-control');
    return out;
  }
  const res = await fetchOrigin();
  if (!isCacheableResponse(res, { htmlOnly })) return tagged(res, 'BYPASS');
  const stored = new Response(res.clone().body, res);
  const originCc = res.headers.get('cache-control');
  if (originCc) stored.headers.set(ORIGIN_CC_HEADER, originCc);
  stored.headers.set('cache-control', `public, max-age=${EDGE_TTL_SECONDS}`);
  stored.headers.delete(EDGE_CACHE_HEADER);
  const put = cache.put(key, stored).catch(() => {});
  if (waitUntil) waitUntil(put); else await put;
  return tagged(res, 'MISS');
}
