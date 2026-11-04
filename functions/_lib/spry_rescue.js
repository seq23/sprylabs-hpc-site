import { SPRY_RESCUE_REDIRECTS } from './spry_rescue_table.js';
// Retired shared assets consolidate from either public host, before the HTML
// cache and ownership routing. Unknown URLs still reach the real 404 handler.
export function spryRescueResponse(request) {
  const url = new URL(request.url);
  if (!['spryexecutiveos.com','billionairehighperformancecoach.com'].includes(url.hostname)) return null;
  // Search Console also retains repeated-slash spellings of retired routes.
  // Resolve them straight to the same guide; unknown paths still pass through.
  const target = SPRY_RESCUE_REDIRECTS.get(url.pathname.replace(/\/{2,}/g, '/'));
  if (!target) return null;
  const out = new URL(target); out.search = url.search;
  return new Response(null,{status:301,headers:{location:out.toString(),'cache-control':'public, max-age=86400'}});
}
