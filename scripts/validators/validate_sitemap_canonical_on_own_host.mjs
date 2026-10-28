#!/usr/bin/env node
/**
 * validate:sitemap-canonical-on-own-host
 *
 * Every URL a host's child sitemap lists must be a page whose rel=canonical is
 * on that same host. A sitemap is the host's claim "this page is mine"; a
 * canonical on the other host hands the page away in the same breath, and
 * Google follows the canonical.
 *
 * 26 Oct 2026: sitemap-bhpc.xml listed /ai-vs-human-coaching/ and
 * /what-should-i-work-on/too-many-tasks-what-now/ while both pages declared a
 * spryexecutiveos.com canonical. Cause: repair_dual_domain_metadata.js read
 * only the route policy, while the sitemaps and the title brand read
 * citable_pages.json first. The repair now reads the same resolution
 * (host_brand.cjs declaredHostForRel).
 *
 * Hosts and their child sitemaps come from config/site_hosts.json, the one map
 * the edge and the sitemap index read. Fails when a sitemap is missing or
 * empty, or when zero listed pages could be resolved to a file, so it can
 * never pass having checked nothing.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TAG = '[validate:sitemap-canonical-on-own-host]';
const hosts = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/site_hosts.json'), 'utf8')).hosts;

const bare = (h) => String(h || '').toLowerCase().replace(/^www\./, '');
function fileFor(pathname) {
  const p = decodeURIComponent(pathname).replace(/^\/+/, '');
  const candidates = p === '' ? ['index.html']
    : p.endsWith('/') ? [`${p}index.html`]
      : p.endsWith('.html') ? [p] : [`${p}.html`, `${p}/index.html`];
  return candidates.find((c) => fs.existsSync(path.join(ROOT, c))) || null;
}
function canonicalOf(html) {
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel=["']?canonical\b/i.test(m[0])) continue;
    const href = m[0].match(/\bhref=["']([^"']+)["']/i);
    if (href) return href[1];
  }
  return null;
}

const errors = [];
let checked = 0;
for (const [host, { child_sitemap: file }] of Object.entries(hosts)) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) { errors.push(`${file} (the ${host} sitemap) is missing`); continue; }
  const locs = [...fs.readFileSync(abs, 'utf8').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  if (!locs.length) { errors.push(`${file} lists no URLs`); continue; }
  let resolved = 0;
  for (const loc of locs) {
    let u;
    try { u = new URL(loc); } catch { errors.push(`${file}: unparseable <loc> ${loc}`); continue; }
    if (bare(u.hostname) !== host) { errors.push(`${file} lists ${loc}, which is not on ${host}`); continue; }
    const rel = fileFor(u.pathname);
    if (!rel) continue; // a URL with no page file is validate:sitemap-coverage's to report
    resolved += 1;
    const canonical = canonicalOf(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    if (!canonical) { errors.push(`${loc} (${rel}) has no rel=canonical`); continue; }
    let ch;
    try { ch = bare(new URL(canonical).hostname); } catch { errors.push(`${loc} (${rel}) canonical is not a URL: ${canonical}`); continue; }
    if (ch !== host) errors.push(`${loc} is in ${file} but its canonical is on ${ch}: ${canonical} (${rel})`);
  }
  if (!resolved) errors.push(`${file}: none of its ${locs.length} URLs resolved to a page file, so nothing was checked`);
  checked += resolved;
}

if (errors.length) {
  console.error(`${TAG} FAIL: ${errors.length} problem(s)`);
  for (const e of errors.slice(0, 60)) console.error(`  - ${e}`);
  if (errors.length > 60) console.error(`  ... and ${errors.length - 60} more`);
  process.exit(1);
}
console.log(`${TAG} OK: ${checked} sitemap pages across ${Object.keys(hosts).length} hosts, each with its canonical on the host whose sitemap lists it`);
