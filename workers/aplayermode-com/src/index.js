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
 * Deploy: npx wrangler deploy --config workers/aplayermode-com/wrangler.jsonc
 * Guarded by scripts/validators/validate_aplayermode_landing.mjs.
 */
export const ORIGIN = 'https://sprylabs-hpc-site.pages.dev';
export const PAGE_PATH = '/aplayermode/';
export const BHPC = 'https://billionairehighperformancecoach.com';
// Site-wide files the landing page loads from outside /aplayermode/.
export const SHARED_ASSETS = new Set([
  '/favicon.ico',
  '/assets/domain-context.js',
  '/assets/img/os-system-image.png',
  '/assets/img/manual-preview-mobile-1.png',
  '/assets/img/manual-preview-mobile-2.png',
  '/assets/img/manual-preview-mobile-3.png',
  '/assets/img/manual-preview-mobile-4.png',
  '/assets/img/manual-preview-mobile-5.png',
]);

/** Pure routing decision, exported for the validator. */
export function route(pathname) {
  if (pathname === '/' || pathname === '/index.html') return { kind: 'page', upstream: PAGE_PATH };
  if (pathname === '/amazon' || pathname.startsWith('/amazon/')) return { kind: 'redirect', location: BHPC + pathname, keepQuery: true };
  if (pathname === '/aplayermode' || pathname === PAGE_PATH || pathname === `${PAGE_PATH}index.html`) return { kind: 'redirect', location: '/', keepQuery: true };
  if (pathname.startsWith(PAGE_PATH) && !pathname.includes('..')) return { kind: 'asset', upstream: pathname };
  if (SHARED_ASSETS.has(pathname)) return { kind: 'asset', upstream: pathname };
  return { kind: 'redirect', location: '/', keepQuery: false };
}

const FORWARD_HEADERS = ['accept', 'accept-encoding', 'accept-language', 'if-none-match', 'if-modified-since', 'range', 'user-agent'];

export default {
  async fetch(request) {
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
    const headers = new Headers();
    for (const h of FORWARD_HEADERS) { const v = request.headers.get(h); if (v) headers.set(h, v); }
    const upstream = await fetch(ORIGIN + r.upstream + url.search, { method: request.method, headers, redirect: 'manual' });
    if (upstream.status >= 300 && upstream.status < 400 && upstream.status !== 304) {
      return new Response(`origin redirected ${r.upstream} (status ${upstream.status}); refusing to follow`, { status: 502 });
    }
    const out = new Response(upstream.body, upstream);
    out.headers.delete('location');
    return out;
  },
};
