#!/usr/bin/env node
/**
 * validate:redirect-and-link-integrity
 *
 * Against the surface that is actually published (.pages-output, assembled here
 * by scripts/assemble_pages_output.js), with Cloudflare Pages' own semantics:
 * the FIRST _redirects rule that matches a path wins.
 *
 *   1. Every exact _redirects rule is reachable (no earlier rule shadows it),
 *      is a single hop (its target matches no rule), and lands on a path the
 *      published surface serves. Rule counts stay inside the Pages limits.
 *   2. Every internal <a href> on every published page resolves - through the
 *      redirects, if it hits one - to a path the surface serves. A link that
 *      ends on nothing is a broken page for a reader and a 404 for a crawler.
 *   3. Every URL Bing Webmaster held as a 404 on 25 Sep 2026 that has a live
 *      equivalent now redirects to it in one hop (fixtures/validation/redirects/
 *      bing_held_404s.json lists them, and the ones deliberately left 404).
 *
 * Why this exists: Bing reported 221 404s on spryexecutiveos.com and 8 on
 * billionairehighperformancecoach.com. 121 were /guides/<slug> URLs of pages
 * that moved to the root on 2026-07-23 with no redirect; others were the
 * no-slash form of retired directory pages whose rule only named `/x/`; and the
 * `/*.html` wildcard sat above every exact `.html` rule, so none of those rules
 * could ever fire. validate:retired-route-references reads the redirect MAP and
 * asserts a line exists; nothing asserted that the line could be reached.
 *
 *   4. Every published directory page's legacy `/<dir>/index.html` URL (and the
 *      root `/index.html`) reaches its page in exactly ONE hop, counting both
 *      the _redirects rules and Pages' own clean-URL redirects (/x.html -> /x,
 *      /x/index -> /x/). Search Console, 16 Oct 2026: spryexecutiveos.com
 *      /how-to-stop-doomscrolling/index.html went `/*.html` -> /…/index, then
 *      Pages 308 -> /…/ (2 hops). The model of Pages' redirects is pinned by a
 *      self-test against that observed chain.
 *
 * Fails on zero rules, zero pages, zero links or zero legacy index URLs examined.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.env.REDIRECT_LINK_INTEGRITY_OUT || path.join(ROOT, '.pages-output');
const HOSTS = new Set(['spryexecutiveos.com', 'billionairehighperformancecoach.com', 'www.spryexecutiveos.com', 'www.billionairehighperformancecoach.com']);
const MAX_STATIC = 2000;
const MAX_DYNAMIC = 100;
const BING_FIXTURE = path.join(ROOT, 'fixtures/validation/redirects/bing_held_404s.json');

const fail = (msg, details = []) => {
  console.error(`[validate:redirect-and-link-integrity] FAIL: ${msg}`);
  for (const d of details.slice(0, 60)) console.error(`  - ${d}`);
  if (details.length > 60) console.error(`  ... and ${details.length - 60} more`);
  process.exit(1);
};

if (!process.env.REDIRECT_LINK_INTEGRITY_OUT) {
  const assemble = spawnSync('node', [path.join('scripts', 'assemble_pages_output.js')], { cwd: ROOT, encoding: 'utf8' });
  if (assemble.status !== 0) fail('the assembler did not complete, so there is no published surface to check.', [assemble.stderr || assemble.stdout || '(no output)']);
}
if (!fs.existsSync(path.join(OUT, '_redirects'))) fail(`${path.relative(ROOT, OUT)}/_redirects is missing; the published surface has no redirect table.`);

// ------------------------------------------------------------------ rules
const rules = [];
fs.readFileSync(path.join(OUT, '_redirects'), 'utf8').split(/\r?\n/).forEach((line, i) => {
  const t = line.trim();
  if (!t || t.startsWith('#')) return;
  const [source, target, status = '302'] = t.split(/\s+/);
  const dynamic = source.includes('*') || /\/:[a-z]/i.test(source);
  rules.push({ index: rules.length, line: i + 1, source, target, status, dynamic });
});
if (!rules.length) fail('_redirects declares zero rules; there is nothing to prove.');
const staticRules = rules.filter((r) => !r.dynamic);
const dynamicRules = rules.filter((r) => r.dynamic);
const errors = [];
if (staticRules.length > MAX_STATIC) errors.push(`${staticRules.length} static rules exceed the Cloudflare Pages limit of ${MAX_STATIC}`);
if (dynamicRules.length > MAX_DYNAMIC) errors.push(`${dynamicRules.length} dynamic rules exceed the Cloudflare Pages limit of ${MAX_DYNAMIC}`);

const exactFirst = new Map();
for (const r of staticRules) if (!exactFirst.has(r.source)) exactFirst.set(r.source, r);
const wildcards = dynamicRules.map((r) => {
  // Only `prefix*` and `prefix*suffix` shapes are used here; anything else
  // cannot be modelled faithfully, so it is an error rather than a guess.
  if (!/^[^*:]*\*[^*:]*$/.test(r.source)) errors.push(`_redirects:${r.line} dynamic source ${r.source} has a shape this validator cannot model`);
  const [prefix, suffix = ''] = r.source.split('*');
  return { ...r, prefix, suffix };
});

/** The first rule that matches `p`, in file order, or null. */
function firstRule(p) {
  let best = exactFirst.get(p) || null;
  for (const w of wildcards) {
    if (best && w.index > best.index) break;
    if (p.length >= w.prefix.length + w.suffix.length && p.startsWith(w.prefix) && p.endsWith(w.suffix)) {
      const splat = p.slice(w.prefix.length, p.length - w.suffix.length);
      if (!best || w.index < best.index) best = { ...w, resolvedTarget: w.target.replace(':splat', splat) };
      break;
    }
  }
  return best;
}
const targetOf = (rule) => rule.resolvedTarget || rule.target;

function internalPath(url) {
  if (/^https?:\/\//i.test(url)) {
    const u = new URL(url);
    return HOSTS.has(u.host) ? u.pathname : null;
  }
  return url.split(/[?#]/)[0];
}

const isFile = (rel) => { try { return fs.statSync(path.join(OUT, rel)).isFile(); } catch { return false; } };
/** Does the published surface answer this path with a page or asset (Pages clean URLs)? */
function serves(p) {
  let rel;
  try { rel = decodeURIComponent(p).replace(/^\/+/, ''); } catch { return false; }
  if (rel === '' || rel.endsWith('/')) return isFile(`${rel}index.html`);
  return isFile(rel) || isFile(`${rel}.html`) || isFile(`${rel}/index.html`);
}

/** Follow _redirects from `p`; returns the final internal path (or null if it leaves the site) and hop count. */
function follow(p) {
  let cur = p;
  let hops = 0;
  const seen = new Set();
  for (;;) {
    const rule = firstRule(cur);
    if (!rule) return { final: cur, hops };
    const next = internalPath(targetOf(rule));
    hops += 1;
    if (next === null) return { final: null, hops };
    if (seen.has(next) || hops > 10) return { final: undefined, hops, loop: true };
    seen.add(next);
    cur = next;
  }
}

// 1. exact rules: reachable, single hop, target served
let rulesChecked = 0;
for (const r of staticRules) {
  rulesChecked += 1;
  const first = firstRule(r.source);
  if (first && first.index !== r.index) {
    errors.push(`_redirects:${r.line} ${r.source} is unreachable: rule on line ${first.line} (${first.source}) matches it first`);
    continue;
  }
  const target = internalPath(r.target);
  if (target === null) continue; // off-site target
  const next = firstRule(target);
  if (next) errors.push(`_redirects:${r.line} ${r.source} -> ${r.target} chains: line ${next.line} (${next.source}) redirects the target again`);
  else if (!serves(target)) errors.push(`_redirects:${r.line} ${r.source} -> ${r.target}: the target is not a published page`);
}

// 2. internal hrefs on every published page
function listHtml(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listHtml(full, out);
    else if (e.name.endsWith('.html')) out.push(path.relative(OUT, full).split(path.sep).join('/'));
  }
  return out;
}
function pageUrl(rel) {
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel.replace(/\.html$/, '')}`;
}
// Directories this repo builds whose pages are published on a host of their own
// (config/index_exclusions.json). Their root-relative links are resolved by that host's Worker,
// not by this Pages surface: /about/ on aplayermode.com is aplayermode/about.html, which would
// look like a 404 measured against spryexecutiveos.com. Those links are not unchecked - the
// aplayermode.com Worker's route() answers for every one of them in
// scripts/validators/validate_aplayermode_landing.mjs, which refuses a root path the Worker does
// not serve from a committed file, and check_aplayermode_live.mjs proves it on the live host.
const OWN_HOST_DIRS = new Map([['aplayermode/', 'https://aplayermode.com']]);
const baseHostFor = (rel) => { for (const [dir, host] of OWN_HOST_DIRS) if (rel.startsWith(dir)) return host; return 'https://spryexecutiveos.com'; };
const pages = listHtml(OUT);
if (!pages.length) fail('the published surface holds zero HTML pages.');
let hrefsChecked = 0;
let redirecting = 0;
const broken = new Map();
for (const rel of pages) {
  const html = fs.readFileSync(path.join(OUT, rel), 'utf8');
  const base = `${baseHostFor(rel)}${pageUrl(rel)}`;
  for (const m of html.matchAll(/<a\b[^>]*?\shref=(["'])([^"']*)\1/gi)) {
    const raw = m[2].replace(/&amp;/g, '&').trim();
    if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(raw) || raw.includes('{{')) continue;
    let u;
    try { u = new URL(raw, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || !HOSTS.has(u.host)) continue;
    // Injected at the edge by Cloudflare email obfuscation; not in the build.
    if (u.pathname.startsWith('/cdn-cgi/')) continue;
    hrefsChecked += 1;
    const { final, hops, loop } = follow(u.pathname);
    if (hops) redirecting += 1;
    if (final === null) continue;
    if (loop || !serves(final)) {
      const key = u.pathname;
      if (!broken.has(key)) broken.set(key, []);
      broken.get(key).push(rel);
    }
  }
}
if (!hrefsChecked) fail('zero internal links examined across the published pages; a link check that reads nothing proves nothing.');
for (const [href, from] of broken) errors.push(`internal link to a 404: ${href} (from ${from.length} page(s), e.g. ${from.slice(0, 3).join(', ')})`);

// 4. legacy /<dir>/index.html URLs: one hop to the page, Pages' own redirects counted.
/** Pages' automatic clean-URL redirect for a path the _redirects table let through, or null. */
function pagesAutoRedirect(p) {
  let rel;
  try { rel = decodeURIComponent(p).replace(/^\/+/, ''); } catch { return null; }
  if (p.endsWith('/index.html')) return p.slice(0, -'index.html'.length);
  if (p.endsWith('/index')) return p.slice(0, -'index'.length);
  if (p.endsWith('.html') && isFile(rel)) return p.slice(0, -'.html'.length);
  if (p.endsWith('/') && p !== '/' && !isFile(`${rel}index.html`) && isFile(`${rel.slice(0, -1)}.html`)) return p.slice(0, -1);
  if (!p.endsWith('/') && !isFile(rel) && !isFile(`${rel}.html`) && isFile(`${rel}/index.html`)) return `${p}/`;
  return null;
}
/** Every hop a client sees from `p`: _redirects first, then Pages' clean URLs. */
function clientHops(p, rule = firstRule, auto = pagesAutoRedirect) {
  const hops = [];
  let cur = p;
  for (let i = 0; i < 10; i += 1) {
    const r = rule(cur);
    const next = r ? internalPath(targetOf(r)) : auto(cur);
    if (next === null || next === undefined) return { final: cur, hops };
    hops.push(next);
    cur = next;
  }
  return { final: undefined, hops, loop: true };
}
// Self-test: the table as it stood on 16 Oct 2026 (only `/*.html /:splat`) must
// reproduce the two-hop chain Search Console saw, or the model is not faithful.
{
  const legacy = { index: 0, line: 0, source: '/*.html', target: '/:splat', prefix: '/', suffix: '.html' };
  const oldRule = (p) => (p.startsWith('/') && p.endsWith('.html') ? { ...legacy, resolvedTarget: p.slice(0, -'.html'.length) } : null);
  const probe = pages.find((rel) => rel.endsWith('/index.html'));
  if (!probe) errors.push('no published directory page to self-test the legacy index.html model against');
  else {
    const { hops } = clientHops(`/${probe}`, oldRule);
    if (hops.length !== 2) errors.push(`self-test: the Pages redirect model gives ${hops.length} hop(s) for /${probe} under the old table; Search Console observed 2`);
  }
}
let legacyChecked = 0;
for (const rel of pages) {
  if (rel !== 'index.html' && !rel.endsWith('/index.html')) continue;
  legacyChecked += 1;
  const want = pageUrl(rel);
  const { final, hops, loop } = clientHops(`/${rel}`);
  if (loop) errors.push(`legacy /${rel} loops: ${hops.join(' -> ')}`);
  else if (hops.length !== 1 || final !== want) errors.push(`legacy /${rel} takes ${hops.length} hop(s) (${hops.join(' -> ') || 'none'}); it must 301 straight to ${want}`);
}
if (!legacyChecked) errors.push('zero legacy /<dir>/index.html URLs examined; the published surface has no directory pages to prove');

// 3. Bing-held 404s
let bingChecked = 0;
if (!fs.existsSync(BING_FIXTURE)) errors.push(`${path.relative(ROOT, BING_FIXTURE)} is missing`);
else {
  const fixture = JSON.parse(fs.readFileSync(BING_FIXTURE, 'utf8'));
  const redirected = fixture.redirected || [];
  const left = fixture.left_as_404 || [];
  if (!redirected.length) errors.push('the Bing 404 fixture lists zero redirected URLs');
  for (const p of redirected) {
    bingChecked += 1;
    const { final, hops } = follow(p);
    if (hops !== 1) errors.push(`Bing-held 404 ${p}: expected one redirect hop, got ${hops}`);
    else if (!final || !serves(final)) errors.push(`Bing-held 404 ${p}: redirects to ${final}, which is not a published page`);
  }
  for (const item of left) {
    bingChecked += 1;
    if (!item.reason) errors.push(`Bing-held 404 ${item.path} is left as a 404 with no reason`);
    const { hops } = follow(item.path);
    if (hops || serves(item.path)) errors.push(`Bing-held 404 ${item.path} is listed as left 404 but now resolves; move it to "redirected"`);
  }
}

if (errors.length) fail(`${errors.length} problem(s)`, errors);
console.log(`[validate:redirect-and-link-integrity] OK: ${staticRules.length} exact + ${dynamicRules.length} wildcard rules reachable, single-hop and landing on published pages; ${hrefsChecked} internal links on ${pages.length} pages resolve (${redirecting} via a redirect); ${bingChecked} Bing-held 404s accounted for; ${legacyChecked} legacy index.html URLs reach their page in one hop`);
