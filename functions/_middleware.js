/**
 * Edge HTML cache for the Pages hosts (billionairehighperformancecoach.com,
 * spryexecutiveos.com and their www/pages.dev aliases). Pages answers every page
 * from its asset store (cf-cache-status: DYNAMIC); this answers repeat requests
 * from caches.default instead, keyed per host + path + build. Files (CSS, JS,
 * images, feeds) pass straight through untouched. Rules: functions/_lib/edge_cache.js.
 *
 * It also holds every request to one canonical host per public domain, before
 * the cache: functions/_lib/canonical_host.js - and then to the host that owns
 * the route, so one route answers 200 on one host only:
 * functions/_lib/route_owner_host.js.
 */
import { serveWithEdgeCache, isPagePath } from './_lib/edge_cache.js';
import { canonicalHostResponse } from './_lib/canonical_host.js';
import { routeOwnerResponse } from './_lib/route_owner_host.js';
import { BUILD_ID } from './_lib/build_id.js';

export async function onRequest(context) {
  const { request } = context;
  // Host first, and for every path - a file served from the www alias is the same
  // split-signal defect as a page. See functions/_lib/canonical_host.js.
  const canonical = canonicalHostResponse(request);
  if (canonical) return canonical;
  // Then the route's owner host, so a page served on both hosts answers 200 on
  // only one. After the host rule (so www. is already an apex) and before the
  // cache (a redirect is never worth an entry). See functions/_lib/route_owner_host.js.
  const owner = routeOwnerResponse(request);
  if (owner) return owner;
  if (!isPagePath(new URL(request.url).pathname)) return context.next();
  return serveWithEdgeCache({
    request,
    buildId: BUILD_ID,
    cache: typeof caches !== 'undefined' ? caches.default : null,
    waitUntil: (p) => context.waitUntil(p),
    fetchOrigin: () => context.next(),
    htmlOnly: true,
  });
}
