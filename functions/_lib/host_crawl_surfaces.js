/**
 * One Pages deployment answers billionairehighperformancecoach.com and
 * spryexecutiveos.com from one tree. The static /sitemap.xml index and
 * /robots.txt name both hosts' child sitemaps, which Search Console rejects as
 * cross-host (400 "Could not process sitemap"), and which sent the portfolio
 * coverage run inspecting the other host's URLs in each property.
 *
 * These helpers narrow the static files to the request host. They filter, they
 * do not generate: the static files stay the single source (written by
 * scripts/lib/sitemap_index.mjs from config/site_hosts.json). Any host not in
 * the map (pages.dev previews, the aplayermode.com Worker's origin fetches) is
 * served the static file unchanged.
 * Guarded by scripts/validators/validate_host_crawl_surfaces.mjs.
 */
import SITE_HOSTS from '../../config/site_hosts.json';

export const HOSTS = SITE_HOSTS.hosts;

/** The owning apex host for a request hostname, or null when it is not one of ours. */
export function ownerHost(hostname = '') {
  const h = String(hostname).toLowerCase().replace(/^www\./, '');
  return Object.prototype.hasOwnProperty.call(HOSTS, h) ? h : null;
}

const locHost = (loc) => { try { return new URL(loc.trim()).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; } };

/** Keep only the <sitemap> entries whose <loc> is on `host`. Everything else (comments, root element) is kept. */
export function narrowSitemapIndex(xml, host) {
  return String(xml).replace(/[ \t]*<sitemap>\s*<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>[ \t]*\r?\n?/g,
    (m, loc) => (locHost(loc) === host ? m : ''));
}

/** Keep only the Sitemap: lines on `host`. */
export function narrowRobots(txt, host) {
  return String(txt).split('\n').filter((line) => {
    const m = line.match(/^\s*sitemap:\s*(\S+)/i);
    return !m || locHost(m[1]) === host;
  }).join('\n');
}

/** A child sitemap that belongs to another host is not served here. */
export function foreignChild(pathname, host) {
  const file = String(pathname).replace(/^\/+/, '');
  return Object.entries(HOSTS).some(([h, v]) => v.child_sitemap === file && h !== host);
}

async function narrowed(context, transform, contentType) {
  const host = ownerHost(new URL(context.request.url).hostname);
  const res = await context.next();
  if (!host || !res.ok) return res;
  const body = transform(await res.text(), host);
  const headers = new Headers(res.headers);
  headers.set('Content-Type', contentType);
  headers.delete('Content-Length');
  headers.delete('ETag');
  headers.set('X-Host-Narrowed', host);
  return new Response(body, { status: 200, headers });
}

export const serveSitemapIndex = (context) => narrowed(context, narrowSitemapIndex, 'application/xml; charset=utf-8');
export const serveRobots = (context) => narrowed(context, narrowRobots, 'text/plain; charset=utf-8');
export function serveChildSitemap(context) {
  const url = new URL(context.request.url);
  const host = ownerHost(url.hostname);
  if (host && foreignChild(url.pathname, host)) {
    return new Response('Not found: this child sitemap belongs to another host.\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
  }
  return context.next();
}
