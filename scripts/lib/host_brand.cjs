'use strict';

// The site name a page's <title> suffix and boilerplate copy must use, derived
// from the host that serves the page. One answer for every writer and the
// validator (validate:title-brand-matches-host), so they cannot drift.
//
// billionairehighperformancecoach.com and spryexecutiveos.com are one property
// cluster served from this repo, but each host has its own name: 25 Oct 2026,
// apply_repairs.mjs and build_navigation_structure.mjs hard-coded
// "| Spry Executive OS" and so stamped the other site's name on 33 bhpc hub
// pages and on every bhpc page a snippet_alignment repair touched.
const path = require('node:path');
const { BRANDS } = require(path.join(__dirname, 'search_snippet_bounds.cjs'));
const { routeFor, hostFor } = require(path.join(__dirname, 'dual_domain_policy.cjs'));

function bareHost(hostOrUrl) {
  return String(hostOrUrl || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
}
function brandForHost(hostOrUrl) {
  const brand = BRANDS[bareHost(hostOrUrl)];
  if (!brand) throw new Error(`[host_brand] no brand declared for host "${hostOrUrl}"; add it to BRANDS in search_snippet_bounds.cjs`);
  return brand;
}
function brandForRoute(route) { return brandForHost(hostFor(route)); }

// The host a page is PUBLISHED on, resolved the way the sitemaps and
// build_navigation_structure.mjs resolve it: an ACTIVE row in
// data/citation/citable_pages.json names its canonical_domain, and that wins;
// otherwise the route policy (hostFor). The validator reads this, so a page the
// sitemap lists on bhpc is held to the bhpc name.
const fs = require('node:fs');
let citable = null;
function citableByPath(root) {
  if (citable) return citable;
  const f = path.join(root, 'data/citation/citable_pages.json');
  const pages = fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')).pages || []) : [];
  citable = new Map(pages.filter((p) => p.status === 'ACTIVE' && p.canonical_domain).map((p) => [p.path, p.canonical_domain]));
  return citable;
}
function publishedHostForRel(rel, root = process.cwd()) {
  const declared = citableByPath(root).get(rel);
  return bareHost(declared || hostFor(routeFor(rel)));
}

// The trailing "| Brand" / "— Brand" a title carries, if it is one of the
// declared brands; null otherwise.
function brandSuffixOf(title) {
  const t = String(title || '').trim();
  for (const brand of Object.values(BRANDS)) {
    const re = new RegExp(`\\s[|—–-]\\s*${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
    if (re.test(t)) return brand;
  }
  return null;
}

module.exports = { BRANDS, bareHost, brandForHost, brandForRoute, publishedHostForRel, brandSuffixOf };
