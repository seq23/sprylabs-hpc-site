#!/usr/bin/env node
/**
 * validate:product-offers
 *
 * Search Console, 16 Oct 2026: a billionairehighperformancecoach.com page failed
 * the Product rich result with "Either offers, review or aggregateRating should
 * be specified". 68 committed Product nodes had no offers, and two emitters
 * hard-coded a $29 offer pointing at aplayermode.com, which is neither the
 * product's price nor its checkout.
 *
 * Fails when, on any published page (the set scripts/lib/published_surface.cjs
 * defines, the same set the Pages assembler ships):
 *   1. a JSON-LD block that names Product does not parse;
 *   2. a Product node has no offers, or an offer without a positive price, a
 *      3-letter priceCurrency, availability and an https url;
 *   3. an offer differs from the one pinned BHPC Gumroad offer
 *      (scripts/lib/bhpc_offer.cjs <- config/aplayermode_plan_prices.json) in
 *      price, currency, url, return policy or delivery terms (it is the only
 *      product on sale on these hosts);
 *   4. a Product carries review or aggregateRating (never invented);
 *   5. the shared emitter (render/content_contract.js completeStructuredData)
 *      produces a Product that fails 2-3;
 *   6. zero Product nodes were examined (Rule 0), or the checker and the repair
 *      cannot be shown to act on a page with an offer-less Product (self-test).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, publishedHtml, repairHtml, frozenRevenueSurfaces } from '../repair/product_offers.mjs';

const requireCjs = createRequire(import.meta.url);
const { bhpcOffer } = requireCjs('../lib/bhpc_offer.cjs');
const { completeStructuredData } = requireCjs('../render/content_contract.js');

const NAME = '[validate:product-offers]';
const PINNED = bhpcOffer();
const LD_RE = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function productsIn(node, out = []) {
  if (Array.isArray(node)) { for (const n of node) productsIn(n, out); return out; }
  if (node && typeof node === 'object') {
    if ([].concat(node['@type'] || []).includes('Product')) out.push(node);
    for (const v of Object.values(node)) productsIn(v, out);
  }
  return out;
}

/** Problems with every Product in one HTML document; returns { products, problems }. */
export function checkHtml(html, label) {
  const problems = [];
  let products = 0;
  for (const m of html.matchAll(LD_RE)) {
    let data;
    try { data = JSON.parse(m[1]); } catch (e) {
      if (/"Product"/.test(m[1])) problems.push(`${label}: a JSON-LD block naming Product does not parse (${e.message})`);
      continue;
    }
    for (const p of productsIn(data)) {
      products += 1;
      const id = `${label} Product ${p['@id'] || p.name || ''}`.trim();
      if (p.review || p.aggregateRating) problems.push(`${id}: carries review/aggregateRating; ratings are never invented`);
      const offers = [].concat(p.offers || []);
      if (!offers.length) { problems.push(`${id}: no offers (Search Console: "Either offers, review or aggregateRating should be specified")`); continue; }
      for (const o of offers) {
        if (!(Number(o.price) > 0) || !/^\d+(\.\d{1,2})?$/.test(String(o.price))) problems.push(`${id}: offer price ${JSON.stringify(o.price)} is not a positive amount`);
        if (!/^[A-Z]{3}$/.test(o.priceCurrency || '')) problems.push(`${id}: offer priceCurrency ${JSON.stringify(o.priceCurrency)} is not an ISO 4217 code`);
        if (!/^https:\/\/schema\.org\//.test(o.availability || '')) problems.push(`${id}: offer has no schema.org availability`);
        if (!/^https:\/\//.test(o.url || '')) problems.push(`${id}: offer has no https url`);
        // The only product on sale on these hosts is the BHPC digital product
        // (scripts/lib/dual_domain_policy.cjs), so every Product offer is the
        // pinned Gumroad offer; a second product would add its own pin here.
        {
          for (const k of ['price', 'priceCurrency', 'availability', 'url', 'hasMerchantReturnPolicy', 'shippingDetails']) {
            if (!same(o[k], PINNED[k])) problems.push(`${id}: offer ${k} ${JSON.stringify(o[k])} is not the pinned Gumroad offer's ${JSON.stringify(PINNED[k])} (config/aplayermode_plan_prices.json)`);
          }
        }
      }
    }
  }
  return { products, problems };
}

const problems = [];
let products = 0;
const pages = publishedHtml();
// Frozen revenue surfaces (download.html, hash-pinned by validate:ownership) are
// never edited, so they are named here instead of failed; anything else frozen
// would have to join that one pin first.
const frozen = frozenRevenueSurfaces();
const exempt = [];
if (frozen.size > 1) problems.push(`more than one frozen revenue surface (${[...frozen].join(', ')}); each exemption here must be reviewed`);
for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!html.includes('Product')) continue;
  if (frozen.has(rel)) { if (checkHtml(html, rel).problems.length) exempt.push(rel); continue; }
  const r = checkHtml(html, rel);
  products += r.products;
  problems.push(...r.problems);
}

// 5. the shared emitter
const emitted = checkHtml(completeStructuredData('', { canonicalUrl: 'https://billionairehighperformancecoach.com/x' }), 'render/content_contract.js completeStructuredData');
if (!emitted.products) problems.push('render/content_contract.js completeStructuredData no longer emits a Product; this check cannot see it');
problems.push(...emitted.problems);

// 6. self-test: the checker fails an offer-less Product and the repair fixes it.
const bare = '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"x","description":"a { brace } in text"}]}</script>';
if (!checkHtml(bare, 'self-test').problems.some((p) => p.includes('no offers'))) problems.push('self-test: the checker passed a Product with no offers');
const repaired = repairHtml(bare);
if (repaired.added !== 1 || checkHtml(repaired.html, 'self-test repaired').problems.length) problems.push('self-test: repair:product-offers did not give an offer-less Product the pinned offer');
if (!checkHtml(bare.replace('"name":"x"', `"name":"x","offers":${JSON.stringify({ ...PINNED, price: '29' })}`), 'self-test').problems.some((p) => p.includes('pinned'))) problems.push('self-test: the checker passed a Gumroad offer at a price that is not the pinned one');

if (!products) problems.push(`zero Product nodes examined across ${pages.length} published pages; a check that reads nothing proves nothing`);
if (problems.length) {
  console.error(`${NAME} FAIL: ${problems.length} problem(s)`);
  for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
  if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`);
  process.exit(1);
}
console.log(`${NAME} OK: ${products} Product node(s) on ${pages.length} published pages each carry an offer (${PINNED.price} ${PINNED.priceCurrency} at ${PINNED.url}); emitter and self-test pass${exempt.length ? `; frozen revenue surface left as pinned: ${exempt.join(', ')}` : ''}`);
