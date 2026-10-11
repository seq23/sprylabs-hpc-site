import { serveSitemapIndex } from './_lib/host_crawl_surfaces.js';
// Per-host /sitemap.xml: lists only the request host's child sitemap (functions/_lib/host_crawl_surfaces.js).
export const onRequestGet = serveSitemapIndex;
