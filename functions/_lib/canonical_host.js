/**
 * One canonical host per public domain (Search Readiness checklist item a1).
 *
 * https://www.billionairehighperformancecoach.com/ answered 200 on 25 Oct 2026
 * instead of redirecting, so every page on this site existed at two addresses
 * and Google was free to treat them as two sites splitting the same signals.
 * Cloudflare Pages `_redirects` cannot match on host, so the rule lives here,
 * in the middleware every request on the Pages hosts already passes through.
 *
 * What redirects: a `www.` host whose apex is one of the two public domains.
 * What does not: the apexes themselves, *.pages.dev (preview deployments are
 * addressed by that host and must keep answering), and anything else - an
 * unknown host is passed through rather than redirected into a domain it was
 * never meant to reach.
 *
 * 301, not 302: the alias is not coming back, and a 301 is what consolidates
 * the signals. Path and query are preserved exactly.
 *
 * Guarded by tests/canonical_host.test.mjs (npm run validate:canonical-host).
 */
export const CANONICAL_HOSTS = Object.freeze([
  'billionairehighperformancecoach.com',
  'spryexecutiveos.com',
]);

/**
 * The absolute URL this request should be redirected to, or null to pass through.
 * @param {string} url the full request URL
 */
export function canonicalRedirect(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const host = parsed.hostname.toLowerCase();
  if (!host.startsWith('www.')) return null;
  const apex = host.slice(4);
  if (!CANONICAL_HOSTS.includes(apex)) return null;
  parsed.hostname = apex;
  return parsed.toString();
}

/** A 301 to the canonical host, or null when the request is already on one. */
export function canonicalHostResponse(request) {
  const target = canonicalRedirect(request.url);
  if (!target) return null;
  return new Response(null, {
    status: 301,
    headers: { location: target, 'cache-control': 'public, max-age=86400' },
  });
}
