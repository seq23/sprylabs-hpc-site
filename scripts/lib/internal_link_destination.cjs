'use strict';
// Compare the terminal published route, including the finite rescue aliases.
// Unknown paths retain their identity; unrelated hosts never satisfy a link.
const { SPRY_RESCUE_REDIRECTS: redirects } = require('../../functions/_lib/spry_rescue_table.js');
function internalDestination(href) {
  if (typeof href !== 'string' || !href.trim()) return null;
  try {
    let url = new URL(String(href).replaceAll('&amp;', '&'), 'https://spryexecutiveos.com');
    if (!['https:', 'http:'].includes(url.protocol) || !['spryexecutiveos.com','billionairehighperformancecoach.com'].includes(url.hostname)) return null;
    if (redirects.has(url.pathname)) url = new URL(redirects.get(url.pathname));
    let route = url.pathname.replace(/\/index\.html$/, '/');
    if (route !== '/download.html') route = route.replace(/\.html$/, '');
    return route;
  } catch { return null; }
}
function hasInternalDestination(html, expected) {
  const want = internalDestination(expected);
  return want !== null && [...html.matchAll(/href=["']([^"']+)["']/g)].some(m => internalDestination(m[1]) === want);
}
module.exports = {internalDestination, hasInternalDestination};
