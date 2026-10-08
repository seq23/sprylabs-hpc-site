/**
 * /aplayermode/ belongs to aplayermode.com (owner, 8 Oct 2026: "move
 * aplayermode.com entirely"). On the shared sites' hostnames it 301s there.
 *
 * Every other host - sprylabs-hpc-site.pages.dev and its deployment previews -
 * is served the page unchanged: the aplayermode.com Worker
 * (workers/aplayermode-com) fetches it from pages.dev, so redirecting there
 * would loop. Deny-by-list on purpose: only the hosts named below redirect.
 * Guarded by scripts/validators/validate_aplayermode_landing.mjs.
 */
export const APLAYERMODE_URL = 'https://aplayermode.com/';
export const MOVED_HOSTS = new Set([
  'billionairehighperformancecoach.com',
  'www.billionairehighperformancecoach.com',
  'spryexecutiveos.com',
  'www.spryexecutiveos.com',
]);

export function onRequest(context) {
  const host = new URL(context.request.url).hostname.toLowerCase();
  if (MOVED_HOSTS.has(host)) {
    return new Response(null, { status: 301, headers: { Location: APLAYERMODE_URL, 'Cache-Control': 'public, max-age=3600' } });
  }
  return context.next();
}
