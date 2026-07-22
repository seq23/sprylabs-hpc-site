#!/usr/bin/env node
import fs from 'node:fs';

const pages = JSON.parse(fs.readFileSync('data/citation/citable_pages.json', 'utf8')).pages
  .filter((page) => page && page.status === 'ACTIVE' && page.path);
const byPath = new Map(pages.map((page) => [page.path, page]));

function routeFor(path) {
  const route = `/${path.replace(/^\/+/, '')}`;
  return route.endsWith('/index.html') ? route.slice(0, -'index.html'.length) : route;
}

function sync(file) {
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  let updates = 0;
  for (const route of payload.routes || []) {
    const page = byPath.get(route.source_file);
    if (!page) continue;
    const next = {
      path: routeFor(page.path),
      canonical_url: page.canonical_url,
      canonical_domain: page.canonical_domain,
      h1: page.query,
      framework: page.framework,
      definition: page.definition,
      extraction_type: page.extraction_type
    };
    for (const [key, value] of Object.entries(next)) {
      if (value !== undefined && route[key] !== value) {
        route[key] = value;
        updates++;
      }
    }
  }
  payload.route_count = (payload.routes || []).length;
  if (!payload.generated_at) payload.generated_at = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return updates;
}

const publicUpdates = sync('_public_route_manifest.json');
const criticalUpdates = sync('_critical_browser_route_manifest.json');
console.log(`[repair:route-manifest-citation-sync] PASS: public_updates=${publicUpdates}; critical_updates=${criticalUpdates}`);
