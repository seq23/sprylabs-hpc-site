import { serveChildSitemap } from './_lib/host_crawl_surfaces.js';
// A child sitemap is served only on the host that owns it; the other host answers 404 (functions/_lib/host_crawl_surfaces.js).
export const onRequestGet = serveChildSitemap;
