#!/usr/bin/env node
/**
 * The ONE writer of the static /sitemap.xml index. Both generators that used to
 * build it with their own literals call this instead:
 *   scripts/programmatic/generate_aplayer_phase_expansion.mjs (import)
 *   scripts/citation/apply_citation_program.py (subprocess: node scripts/lib/sitemap_index.mjs)
 *
 * The children come from config/site_hosts.json, the same map the Pages
 * functions use to narrow the index per request host (functions/_lib/
 * host_crawl_surfaces.js), so a production host is only ever told about its own
 * child sitemap. The static file itself names every child because it is also
 * what a non-production host (pages.dev) is served.
 *
 * Each child's lastmod is the newest date inside it, not the build time.
 * Guarded by scripts/validators/validate_host_crawl_surfaces.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function siteHosts(root = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(root, 'config/site_hosts.json'), 'utf8')).hosts;
}

export function buildSitemapIndex(root = process.cwd(), today = new Date().toISOString().slice(0, 10)) {
  const newestIn = (file) => {
    try {
      const d = [...fs.readFileSync(path.join(root, file), 'utf8').matchAll(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/g)].map((m) => m[1]);
      return d.length ? d.sort().at(-1) : today;
    } catch { return today; }
  };
  let priority = {};
  try { priority = JSON.parse(fs.readFileSync(path.join(root, 'data/index_priority.json'), 'utf8')); } catch { priority = {}; }
  const comments = Array.from(new Set([...Object.values(priority.classes || {}).flat(), '/download']))
    .filter(Boolean).map((u) => `  <!-- priority-coverage ${u} -->`);
  const children = Object.entries(siteHosts(root))
    .map(([host, v]) => `  <sitemap><loc>https://${host}/${v.child_sitemap}</loc><lastmod>${newestIn(v.child_sitemap)}</lastmod></sitemap>`);
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...children, ...comments, '</sitemapindex>', ''].join('\n');
}

export function writeSitemapIndex(root = process.cwd(), today) {
  fs.writeFileSync(path.join(root, 'sitemap.xml'), buildSitemapIndex(root, today));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const today = process.env.SITEMAP_TODAY || undefined;
  writeSitemapIndex(process.cwd(), today);
  console.log('sitemap_index: wrote sitemap.xml from config/site_hosts.json');
}
