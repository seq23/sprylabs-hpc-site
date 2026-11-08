#!/usr/bin/env node
/**
 * Every BHPC buy link on this repo's pages tells Gumroad the page and the button (8 Nov 2026).
 *
 * What Gumroad keeps (its own code, antiwork/gumroad UtmLinkTracking + UtmLinkVisitRecorder, and
 * help article 270): a product-page visit that carries utm_source, utm_medium AND utm_campaign
 * (all three, or nothing is recorded; utm_term / utm_content optional) creates a UTM link in the
 * seller's dashboard and credits the sale to it; values are lowercased and anything outside
 * a-z 0-9 - _ becomes "-". The Sales API (v2) returns those five fields and `referrer` per sale.
 * Our links carry rel="noreferrer", so without tags Gumroad saw no referrer at all.
 *
 * The scheme (docs/operations/link-tracking.md; her final call 8 Nov 2026):
 *   on-site button  utm_source=<site host, Gumroad-safe>  utm_medium=site  utm_campaign=<page slug>-<button>
 *   inbound link    utm_source=kdp|pinterest|instagram|tiktok|direct-share  utm_medium=book|social|share
 *                   utm_campaign=<book or post slug>
 * All three always present.
 * A link that already carries utm_source (the Kindle companion pages) keeps its own tags.
 * assets/domain-context.js and aplayermode/app.js swap in a visitor's inbound tags at click time.
 *
 * It also puts the free Cloudflare Web Analytics beacon on every page (per host), which was
 * switched on in the dashboard but never served: the Pages Functions responses were not injected.
 *
 *   node scripts/tracking/tag_buy_links.mjs          rewrite the pages (idempotent)
 *   node scripts/tracking/tag_buy_links.mjs --check  exit 1 naming any untagged link or missing beacon
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { listEveryServedPage } = require('../lib/site_pages.js');

export const PRODUCT = 'https://sprylabs.gumroad.com/l/billionaire-high-performance-coach';
// Cloudflare Web Analytics site tokens: public by design (every page that loads the beacon prints it).
export const BEACON = {
  'billionairehighperformancecoach.com': 'f065ce22dcb04182b19db9a806f1044f',
  'spryexecutiveos.com': '8fb5313683c84dd5952bb59da648c15c',
  'aplayermode.com': '4717099c4ae348fba3d38e46cb69c8a5',
};
export const gumroadSafe = (v) => String(v).toLowerCase().replace(/[^a-z0-9\-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 200);

export function siteFor(rel) { return rel.startsWith('aplayermode/') ? 'aplayermode' : 'billionairehighperformancecoach'; }
export function hostFor(rel, html) {
  if (rel.startsWith('aplayermode/')) return 'aplayermode.com';
  const m = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i);
  const href = m && (m[0].match(/href=["']([^"']+)["']/i) || [])[1];
  try { const h = new URL(href).hostname; if (BEACON[h]) return h; } catch {}
  return 'billionairehighperformancecoach.com';
}
export function pageSlug(rel) {
  let p = rel.replace(/^aplayermode\//, '').replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '');
  return gumroadSafe(p.replace(/\//g, '-')) || 'home';
}

/** Tag every PRODUCT href in `html`; button = nearest preceding id (or class), numbered when repeated. */
export function tagHtml(html, rel) {
  const campaign = pageSlug(rel);
  const source = siteFor(rel);
  const seen = new Map();
  const re = new RegExp(`href=(["'])(${PRODUCT.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')})(\\?[^"']*)?\\1`, 'g');
  return html.replace(re, (all, q, base, query, offset) => {
    const params = new URLSearchParams((query || '').slice(1).replace(/&amp;/g, '&'));
    // Every buy button opens Gumroad's checkout straight away (her yes 8 Nov 2026; help article 270: wanted=true).
    if (params.get('utm_source')) {
      if (params.get('wanted') === 'true') return all;
      params.set('wanted', 'true');
      return `href=${q}${base}?${params.toString().replace(/&/g, '&amp;')}${q}`;
    }
    const before = html.slice(Math.max(0, offset - 20000), offset);
    const ids = [...before.matchAll(/\bid=["']([^"']+)["']/g)];
    const tagStart = before.lastIndexOf('<a');
    const cls = (before.slice(tagStart).match(/class=["']([^"']+)["']/) || [])[1];
    let name = gumroadSafe(ids.length ? ids[ids.length - 1][1] : (cls ? cls.split(/\s+/).pop() : 'link')) || 'link';
    const n = (seen.get(name) || 0) + 1; seen.set(name, n);
    if (n > 1) name = `${name}-${n}`;
    for (const [k, v] of [['wanted', 'true'], ['utm_source', source], ['utm_medium', 'site'], ['utm_campaign', gumroadSafe(`${campaign}-${name}`)]]) params.set(k, v);
    return `href=${q}${base}?${params.toString().replace(/&/g, '&amp;')}${q}`;
  });
}

export function beaconTag(host) {
  return `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${BEACON[host]}"}'></script>`;
}
export function addBeacon(html, host) {
  if (html.includes('static.cloudflareinsights.com/beacon.min.js')) return html;
  if (!/<\/body>/i.test(html)) return html;
  return html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${beaconTag(host)}</body>`);
}

function pages() {
  return listEveryServedPage().filter((rel) => rel.endsWith('.html'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  let changed = 0, links = 0; const problems = [];
  for (const rel of pages()) {
    const html = fs.readFileSync(rel, 'utf8');
    const out = addBeacon(tagHtml(html, rel), hostFor(rel, html));
    links += (out.match(/gumroad\.com\/l\/billionaire-high-performance-coach/g) || []).length;
    if (out !== html) { if (check) problems.push(rel); else { fs.writeFileSync(rel, out); changed += 1; } }
  }
  if (!links) { console.error('NAMED STOP [NO_BUY_LINKS] no BHPC buy link found on any page'); process.exit(1); }
  if (check && problems.length) { console.error(`[buy-link-tags] FAIL: ${problems.length} page(s) with an untagged buy link or no beacon, e.g. ${problems.slice(0, 5).join(', ')}`); process.exit(1); }
  console.log(`OUTPUT [buy-link-tags] ${check ? 'checked' : `rewrote ${changed} page(s)`}, ${links} buy link(s)`);
}
