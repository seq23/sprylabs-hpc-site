#!/usr/bin/env node
/**
 * validate:title-brand-matches-host
 *
 * Every indexable page must name its own site. A title ending in a site name ("| Spry Executive OS",
 * "| Billionaire High Performance Coach") must name the host that serves it.
 * The host is the one the page is published on (host_brand.cjs
 * publishedHostForRel: citable_pages.json's canonical_domain, else
 * dual_domain_policy.cjs's hostFor - the same resolution the sitemaps and the
 * hub builder use) and the name comes from host_brand.cjs, so the check reads
 * exactly what the writers read.
 *
 * 25 Oct 2026: apply_repairs.mjs (snippet_alignment) and
 * build_navigation_structure.mjs (hub titles) hard-coded "| Spry Executive OS",
 * which put the sibling site's name on 33 billionairehighperformancecoach.com
 * hub pages. Fails if zero pages are examined or zero carry a brand suffix.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const B = require(path.join(ROOT, 'scripts/lib/search_snippet_bounds.cjs'));
const H = require(path.join(ROOT, 'scripts/lib/host_brand.cjs'));
const { listIndexablePages, assertExamined } = require(path.join(ROOT, 'scripts/lib/site_pages.js'));
const TAG = '[validate:title-brand-matches-host]';

const pages = listIndexablePages(ROOT).filter((rel) => !B.EXEMPT_PAGES.has(rel));
assertExamined('validate:title-brand-matches-host', pages.length);

const errors = [];
let branded = 0;
for (const rel of pages) {
  const title = B.titleOf(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const suffix = H.brandSuffixOf(title);
  if (suffix) branded += 1;
  const host = H.publishedHostForRel(rel, ROOT);
  let want;
  try { want = H.brandForHost(host); } catch (e) { errors.push(`${rel}: ${e.message}`); continue; }
  if (!B.titleNamesHost(title, host)) errors.push(`${rel} (served on ${host}): title does not name its own site: "${title}"`);
  if (B.titleNamesSibling(title, host)) errors.push(`${rel}: title names a sibling property: "${title}"`);
  if (suffix && suffix !== want) errors.push(`${rel} (served on ${host}): title ends "| ${suffix}", want "| ${want}": "${title}"`);
}
if (!branded) errors.push('zero indexable titles carry a brand suffix, so the check proved nothing - the scan or the suffix pattern is broken');

if (errors.length) {
  console.error(`${TAG} FAIL: ${errors.length} problem(s) across ${pages.length} pages (${branded} with a brand suffix)`);
  for (const e of errors.slice(0, 60)) console.error(`  - ${e}`);
  if (errors.length > 60) console.error(`  ... and ${errors.length - 60} more`);
  process.exit(1);
}
console.log(`${TAG} OK: ${branded} of ${pages.length} indexable titles carry a brand suffix, all ${pages.length} name their own host`);
