import { serveRobots } from './_lib/host_crawl_surfaces.js';
// Per-host /robots.txt: names only the request host's sitemap (functions/_lib/host_crawl_surfaces.js).
export const onRequestGet = serveRobots;
