/**
 * Routes consolidated onto another page on billionairehighperformancecoach.com.
 *
 * Owner's decision, portfolio check 25 Oct 2026 (Brief 5): "ai-executive-coach
 * goes to bhpc". The AI executive coach queries are measured on bhpc (73
 * impressions in 28 days); spryexecutiveos.com carried four pages on the same
 * topic that earned none and split the signal. Each now answers a 301 to the
 * bhpc page that covers its content, on BOTH shared hosts: the pages are
 * spry-owned, so the bhpc host also served them as a 200 mirror.
 *
 * The source pages stay in the tree (75 internal links still name them; the 301
 * carries those) but are listed in no sitemap. A route here may never be a
 * target, so there is no chain and no loop.
 *
 * Matching is exact on the route key (routeKeyFor: /foo.html is /foo), so
 * /ai-executive-coach/ redirects while /ai-executive-coach, its target, does
 * not. Only the two public hosts redirect; *.pages.dev previews answer as asked.
 *
 * Guarded by tests/host_consolidation.test.mjs (npm run validate:host-consolidation).
 */
import { routeKeyFor } from './route_owner_host.js';

export const CONSOLIDATION_HOSTS = Object.freeze(['billionairehighperformancecoach.com', 'spryexecutiveos.com']);
const BHPC = 'https://billionairehighperformancecoach.com';

export const CONSOLIDATED_ROUTES = Object.freeze(new Map([
  ['/ai-executive-coach/', `${BHPC}/ai-executive-coach`],
  ['/ai-executive-coach-alternative-for-high-performers', `${BHPC}/ai-executive-coach`],
  ['/answers/ai-executive-coach-alternative', `${BHPC}/what-is-an-ai-executive-coach`],
  ['/clusters/ai-executive-coaching', `${BHPC}/synthesis-ai-executive-coaching`],
]));

/** The absolute URL to 301 to, or null to pass through. Query string kept. */
export function consolidationRedirect(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!CONSOLIDATION_HOSTS.includes(parsed.hostname.toLowerCase())) return null;
  const target = CONSOLIDATED_ROUTES.get(routeKeyFor(parsed.pathname));
  if (!target) return null;
  const out = new URL(target);
  out.search = parsed.search;
  return out.toString();
}

export function consolidationResponse(request) {
  const target = consolidationRedirect(request.url);
  if (!target) return null;
  return new Response(null, {
    status: 301,
    headers: { location: target, 'cache-control': 'public, max-age=86400' },
  });
}
