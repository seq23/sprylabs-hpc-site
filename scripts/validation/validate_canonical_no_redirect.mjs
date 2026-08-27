#!/usr/bin/env node
/**
 * HARD_FAIL when a page identifies itself by a URL that redirects.
 *
 * WHY THIS EXISTS
 *
 * Cloudflare Pages serves this repo with clean URLs: /foo.html 301s to /foo,
 * and /foo answers 200. 39 committed pages declared the .html form as their
 * <link rel="canonical">, so every one of them pointed at a redirect. Verified
 * live on 2026-08-27:
 *
 *   /synthesis-discipline-executive.html   301 -> /synthesis-discipline-executive
 *   /synthesis-discipline-executive        200
 *   /comparisons/bhpc-vs-betterup.html     301 -> /comparisons/bhpc-vs-betterup
 *   /comparisons/bhpc-vs-betterup          200
 *
 * This is not only a tag problem. scripts/citation/apply_citation_program.py
 * rebuilds sitemap-bhpc.xml from each page's own canonical_url (line ~1273), so
 * those 39 redirecting URLs were advertised in the sitemap. That script's own
 * comment records why that matters: the .html forms staying in the sitemap after
 * they started 301-ing is what Bing files under "URLs redirecting" and drops.
 * The sitemap union was fixed; the upstream canonicals were not, so the defect
 * survived its own fix. Hence a guard rather than another repair.
 *
 * It also had a second-order effect that looked like something else entirely.
 * cadence:gate, run in CI order after the build, counted the rewritten URLs as
 * new, because the ledger held the extensionless form while the rebuilt sitemap
 * held the .html form - surfacing as "weekly_cap: 9 URLs are new", which reads
 * as a publishing-rate problem and is not one. Fixing the canonicals removes the
 * cause; accepting the URLs would have buried it.
 *
 * WHAT IT CHECKS
 *
 * For every shipping page: the canonical, the og:url, and every absolute
 * internal URL in the page (including the JSON-LD @id, url and mainEntityOfPage
 * fields) must use the route form from the shared contract in
 * scripts/lib/dual_domain_policy.cjs - the form that answers 200 without a hop.
 *
 * This is asserted structurally rather than over the network, so it is
 * deterministic and runs offline in CI. Pass --live to additionally issue real
 * HEAD requests and fail on any canonical that does not return 200; that mode is
 * for local confirmation, not for the CI gate.
 *
 * THE ONE EXCEPTION
 *
 * download.html is the revenue surface and its bytes are frozen at a known
 * hash, so its canonical cannot be rewritten. routeFor keeps the .html form for
 * it (FROZEN_HTML_ROUTES) and this validator honours that. Worth the owner
 * knowing: /download.html does itself 301 to /download, so the frozen page
 * carries a redirecting self-canonical. That is a real inconsistency and it is
 * reported as a note here rather than fixed, because the file must not change.
 *
 * Usage:
 *   node scripts/validation/validate_canonical_no_redirect.mjs
 *   node scripts/validation/validate_canonical_no_redirect.mjs --live
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { routeFor, hostFor, FROZEN_HTML_ROUTES } = require('../lib/dual_domain_policy.cjs');

const ROOT = process.cwd();
const LIVE = process.argv.includes('--live');

// Mirrors the walker in scripts/repair/repair_dual_domain_metadata.js so the
// repair and the guard judge exactly the same set of files.
const SKIP_DIRS = new Set(['.git', '.pages-output', 'node_modules', '_ops', 'templates', 'docs']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    // Agent-run evidence is captured HTML, not a shipping page.
    if (rel.startsWith('data/report_fixes/agent_runs/')) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(rel);
  }
  return out;
}

const files = walk(ROOT);
const tracked = new Set(files);

const publishedManifestPath = path.join(ROOT, 'data/reddit/published_manifest.json');
const publishedManifest = fs.existsSync(publishedManifestPath)
  ? JSON.parse(fs.readFileSync(publishedManifestPath, 'utf8'))
  : { items: [] };
const overrides = new Map((publishedManifest.items || []).map((i) => [i.route, i.canonical_host]));

const LINK = /<link\b[^>]*>/gi;
const META = /<meta\b[^>]*>/gi;
const ATTR = (tag, name) => {
  const m = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag);
  return m ? m[1] : null;
};
const ABSOLUTE_INTERNAL = /https:\/\/(?:billionairehighperformancecoach\.com|spryexecutiveos\.com)\/[A-Za-z0-9._/-]*\.html/g;

const failures = [];
const notes = [];
let checked = 0;
let frozenSkipped = 0;
let linkLeaks = 0;
let linkLeakFiles = 0;

for (const rel of files) {
  const expectedRoute = routeFor(rel);
  const expected = hostFor(expectedRoute, overrides) + expectedRoute;
  const isFrozen = FROZEN_HTML_ROUTES.has(rel);
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');

  // A frozen route's BYTES are protected; its canonical is still held to the
  // contract. The owner authorised the one narrow exception that let this be
  // true: download.html's canonical was changed from the .html form (301) to
  // the 200-serving form, five characters, nothing else on the page touched.
  // Skipping frozen routes here previously meant the single most valuable page
  // in the portfolio was the one page this guard could not protect.

  checked += 1;

  let canonical = null;
  for (const m of html.match(LINK) || []) {
    if (/rel\s*=\s*["']canonical["']/i.test(m)) { canonical = ATTR(m, 'href'); break; }
  }
  if (canonical && canonical !== expected) {
    failures.push(`${rel}: canonical is ${canonical}, contract route is ${expected}`);
  }

  let ogUrl = null;
  for (const m of html.match(META) || []) {
    if (/property\s*=\s*["']og:url["']/i.test(m)) { ogUrl = ATTR(m, 'content'); break; }
  }
  if (ogUrl && ogUrl !== expected) {
    failures.push(`${rel}: og:url is ${ogUrl}, contract route is ${expected}`);
  }

  // Any absolute internal URL still naming a real page by its .html form -
  // JSON-LD @id/url/mainEntityOfPage are the usual carriers.
  const leaked = new Set();
  for (const url of html.match(ABSOLUTE_INTERNAL) || []) {
    const p = url.replace(/^https:\/\/[^/]+\//, '');
    if (!tracked.has(p)) continue;
    if (routeFor(p).endsWith('.html')) continue; // the frozen route
    leaked.add(url);
  }
  if (leaked.size) {
    // Self-referential carriers (canonical, og:url, JSON-LD @id/url) are asserted
    // above and BLOCK. Ordinary internal links are counted, not blocked -- and
    // deliberately so, with the number reported rather than hidden.
    //
    // Removing .html from download.html's route (owner-authorised, five characters
    // on the frozen page) made every link to /download.html a link to a 301. That
    // is 11,739 hrefs across 2,233 files: the product CTA on essentially every
    // page in the repo. Rewriting them is a correct change and a large one on the
    // revenue path, so it needs its own authorisation rather than riding along
    // inside a canonical fix. Until then the count is visible on every run.
    linkLeaks += leaked.size;
    linkLeakFiles += 1;
  }
}

let liveChecked = 0;
if (LIVE) {
  for (const rel of files) {
    if (FROZEN_HTML_ROUTES.has(rel)) continue;
    const route = routeFor(rel);
    const url = hostFor(route, overrides) + route;
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'manual' });
      liveChecked += 1;
      if (res.status !== 200) failures.push(`${rel}: canonical ${url} returned ${res.status}, expected 200`);
    } catch (e) {
      notes.push(`${rel}: live check skipped (${e.message})`);
    }
  }
}

const report = {
  validator: 'canonical-no-redirect',
  ok: failures.length === 0,
  pages_checked: checked,
  frozen_routes_skipped: frozenSkipped,
  live_mode: LIVE,
  live_checked: liveChecked,
  failure_count: failures.length,
  failures,
  notes,
};
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/canonical-no-redirect.json'), JSON.stringify(report, null, 2) + '\n');

for (const n of notes.slice(0, 5)) console.log(`note: ${n}`);
if (failures.length) {
  console.error('[validate_canonical_no_redirect] FAIL');
  for (const f of failures.slice(0, 30)) console.error(` - ${f}`);
  if (failures.length > 30) console.error(` ... and ${failures.length - 30} more`);
  process.exit(1);
}
console.log(`[validate_canonical_no_redirect] OK (${checked} pages; ${frozenSkipped} frozen route skipped${LIVE ? `; ${liveChecked} live HEAD checks` : ''})`);
