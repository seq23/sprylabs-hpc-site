/**
 * One 200 per route across the two shared hosts (Search Readiness item a2).
 *
 * One Pages deployment answers billionairehighperformancecoach.com and
 * spryexecutiveos.com from one tree, so every page is served on both and only
 * one of them is canonical. On 25 Oct 2026 https://spryexecutiveos.com/ answered
 * 200 with rel=canonical pointing at https://billionairehighperformancecoach.com/ -
 * the homepage, which the spry host's own sitemap does not even claim. The
 * checklist's reason: "The canonical is the page's statement of its own address.
 * Pointing it anywhere else hands the page away."
 *
 * The canonical tag was right; serving a 200 beside it was the defect. A
 * canonical is a hint, and a duplicate that answers 200 is still a duplicate
 * Google may index. So a route asked for on the host that does not own it gets a
 * 301 to the host that does, and the only 200 is the canonical one. Nothing a
 * visitor sees changes: spryexecutiveos.com/ already served the BHPC homepage,
 * BHPC-branded, with that canonical. Now the address agrees with the page.
 *
 * Direction, deliberately: this redirects BHPC-owned routes OFF the spry host
 * only. The mirror case - spry-owned routes answering on the BHPC host - is the
 * same defect class and is open work on branch
 * fix/bhpc-mirror-duplicate-canonicals, so it is left alone rather than fixed
 * twice in two ways.
 *
 * What is never redirected:
 *   - any host but spryexecutiveos.com: the BHPC apex, and every *.pages.dev
 *     preview, which must keep answering at the host it was asked for;
 *   - a route not in the generated table, so an unknown path still answers a
 *     real 404 on the host that was asked (item a9 requires exactly that, and a
 *     "redirect anything not spry-owned" rule would have broken it);
 *   - files, as opposed to pages: assets, feeds and the crawl surfaces
 *     (robots.txt, the sitemaps) are served per host on purpose;
 *   - the operator surfaces /admin and /agency, the API, and Cloudflare's own
 *     /cdn-cgi paths;
 *   - /aplayermode, which has its own redirect to aplayermode.com
 *     (functions/aplayermode/index.js) and must not be sent through BHPC first.
 *
 * 301, not 302, and the query string is preserved: this is the address the page
 * has always declared, and a 301 is what consolidates the signals.
 *
 * Table: functions/_lib/route_owner_table.js (generated).
 * Guarded by tests/route_owner_host.test.mjs (npm run validate:route-owner-host).
 */
import { BHPC_ROUTES, BHPC_HOST, SPRY_HOST } from './route_owner_table.js';

/** Prefixes that are served per host on purpose, or handled elsewhere. */
export const NEVER_REDIRECT_PREFIXES = Object.freeze([
  '/admin', '/agency', '/api/', '/cdn-cgi/', '/functions/', '/aplayermode',
]);

/** True for a path that names a page rather than a file. */
function isPage(pathname) {
  const last = pathname.split('/').pop() || '';
  return !last.includes('.') || /\.html?$/i.test(last);
}

/**
 * The route key used in the table. Mirrors routeFor() in
 * scripts/lib/dual_domain_policy.cjs as the server resolves it: /foo.html is
 * the .html form of /foo, and a directory page keeps its trailing slash.
 */
export function routeKeyFor(pathname) {
  if (pathname === '/') return '/';
  return pathname.replace(/\.html$/i, '');
}

/**
 * The absolute URL this request should be 301'd to, or null to pass through.
 * @param {string} url the full request URL
 */
export function routeOwnerRedirect(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.hostname.toLowerCase() !== SPRY_HOST) return null;
  const pathname = parsed.pathname;
  if (!isPage(pathname)) return null;
  const lower = pathname.toLowerCase();
  for (const p of NEVER_REDIRECT_PREFIXES) {
    if (lower === p || lower.startsWith(p.endsWith('/') ? p : `${p}/`) || lower === `${p}/`) return null;
  }
  const route = routeKeyFor(pathname);
  if (!BHPC_ROUTES.has(route)) return null;
  parsed.hostname = BHPC_HOST;
  return parsed.toString();
}

/** A 301 to the route's owner host, or null when this host already owns it. */
export function routeOwnerResponse(request) {
  const target = routeOwnerRedirect(request.url);
  if (!target) return null;
  return new Response(null, {
    status: 301,
    headers: { location: target, 'cache-control': 'public, max-age=86400' },
  });
}
