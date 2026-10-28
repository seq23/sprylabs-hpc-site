#!/usr/bin/env node
/**
 * repair:product-offers
 *
 * Every schema.org Product node in the published pages' JSON-LD carries the real
 * BHPC offer (scripts/lib/bhpc_offer.cjs -> config/aplayermode_plan_prices.json,
 * the pinned live Gumroad price). A Product with no offers, review or
 * aggregateRating is an invalid Product rich result: Search Console failed one
 * on billionairehighperformancecoach.com on 16 Oct 2026, and 68 committed Product
 * nodes (64 legacy article graphs, the 4 buyer pages) had none.
 *
 * The node is edited in place: `,"offers":{...}` is inserted before the Product
 * object's closing brace, so the rest of the page and the rest of the JSON-LD
 * block keep their bytes. Reviews and ratings are never added. Frozen revenue
 * surfaces (download.html) are never touched; the validator names them.
 *
 *   node scripts/repair/product_offers.mjs --apply   rewrite pages that need it
 *   node scripts/repair/product_offers.mjs --check   exit 1 if any page needs it
 *
 * It also puts that price where a reader can see it. Markup the visible page
 * does not support is treated as deceptive and can cost every rich result on
 * the domain, which is Search Readiness checklist item c5: on 25 Oct 2026 all
 * 64 pages carried "price":"49.00" in their JSON-LD and only 4 said $49
 * anywhere a person could read. The sentence is written from the same pinned
 * offer, so the visible price and the marked-up price are one number.
 *
 * Idempotent; exits non-zero when it finds zero Product nodes (Rule 0).
 * Guarded by scripts/validators/validate_product_offers.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const requireCjs = createRequire(import.meta.url);
const { bhpcOffer } = requireCjs('../lib/bhpc_offer.cjs');
const { excluded } = requireCjs('../lib/published_surface.cjs');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LD_RE = /(<script\b[^>]*type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi;
const PRICE_BLOCK_RE = /<p\b[^>]*\bdata-offer-price=["'][^"']*["'][^>]*>[\s\S]*?<\/p>/i;
const PRODUCT_ANCHOR_RE = /<p\b[^>]*class=["'][^"']*\bproduct-anchor\b[^"']*["'][^>]*>[\s\S]*?<\/p>/i;

/** The one visible sentence that states the offer, written from the offer itself. */
export function priceBlock(offer = bhpcOffer()) {
  const amount = offer.price.endsWith('.00') ? offer.price.slice(0, -3) : offer.price;
  return `<p class="product-price" data-offer-price="${offer.price}">The system manual is a one-time <strong>$${amount} ${offer.priceCurrency}</strong> through Gumroad, with instant digital delivery and no subscription.</p>`;
}

/** The visible text of a document, with script and markup removed. */
export function visibleText(html) {
  const body = String(html).slice(Math.max(0, String(html).search(/<body\b/i)));
  return body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

/** Every Offer price this document's JSON-LD claims, as written. */
export function claimedOfferPrices(html) {
  const prices = new Set();
  for (const m of String(html).matchAll(LD_RE)) {
    let parsed;
    try { parsed = JSON.parse(m[2]); } catch { continue; }
    (function scan(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(scan); return; }
      if ([].concat(node['@type'] || []).includes('Offer') && node.price != null) prices.add(String(node.price));
      Object.values(node).forEach(scan);
    })(parsed);
  }
  return [...prices];
}

/** Is `price` ("49.00") stated in the visible text, as $49 or $49.00? */
export function priceIsVisible(html, price) {
  const text = visibleText(html);
  const plain = String(price).replace(/\.00$/, '');
  return text.includes(`$${price}`) || text.includes(`$${plain}`);
}

/**
 * Put the visible price immediately after the page's product anchor - the
 * paragraph that already names the product and links to the checkout - so the
 * price reads as part of the offer rather than as a stray line. Without an
 * anchor it goes at the end of the main content, which is where that page's
 * own call to action already is. A page already carrying the block has it
 * replaced in place, which is how a price change propagates.
 */
export function applyVisiblePrice(html, offer = bhpcOffer()) {
  const block = priceBlock(offer);
  if (PRICE_BLOCK_RE.test(html)) {
    const next = html.replace(PRICE_BLOCK_RE, block);
    return { html: next, changed: next !== html, placed: true };
  }
  const anchor = html.match(PRODUCT_ANCHOR_RE);
  if (anchor) return { html: html.replace(anchor[0], `${anchor[0]}${block}`), changed: true, placed: true };
  for (const close of ['</main>', '</body>']) {
    const at = html.lastIndexOf(close);
    if (at !== -1) return { html: `${html.slice(0, at)}${block}${html.slice(at)}`, changed: true, placed: true };
  }
  return { html, changed: false, placed: false };
}



/** Every published .html file under `root`, as repo-relative paths. */
export function publishedHtml(root = ROOT) {
  const out = [];
  (function walk(dir, depth) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (depth === 0 && excluded(e.name)) continue;
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.isFile() && e.name.endsWith('.html')) out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  })(root, 0);
  return out.sort();
}

/**
 * Pages frozen byte-for-byte as revenue surfaces (download.html: the page behind
 * the only verified sales). Read from the one hash pin
 * (artifacts/validation/pre-implementation-protected-hashes.json, tier
 * revenue_surface, enforced by validate:ownership); never edited here.
 */
export function frozenRevenueSurfaces(root = ROOT) {
  const pin = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/validation/pre-implementation-protected-hashes.json'), 'utf8'));
  return new Set(Object.keys(pin.tiers?.revenue_surface?.files || {}));
}

const isProduct = (node) => node && typeof node === 'object' && !Array.isArray(node)
  && [].concat(node['@type'] || []).includes('Product');

/**
 * Positions of every JSON object in `text` as [start, end] (end = index of its
 * closing brace), innermost first. A string-aware brace scan, so a brace inside
 * a description never counts.
 */
function objectSpans(text) {
  const spans = [];
  const stack = [];
  let inStr = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i += 1;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') stack.push(i);
    else if (c === '}' && stack.length) spans.push([stack.pop(), i]);
  }
  return spans;
}

/** Insert the offer into every Product object of one JSON-LD block that lacks offers. */
export function repairJsonLd(text, offer = bhpcOffer()) {
  let parsedOk = true;
  try { JSON.parse(text); } catch { parsedOk = false; }
  if (!parsedOk) return { text, added: 0, products: 0, unparsed: /"Product"/.test(text) };
  const inserts = [];
  let products = 0;
  for (const [start, end] of objectSpans(text)) {
    let node;
    try { node = JSON.parse(text.slice(start, end + 1)); } catch { continue; }
    if (!isProduct(node)) continue;
    products += 1;
    if (node.offers) continue;
    inserts.push(end);
  }
  let out = text;
  for (const at of inserts.sort((a, b) => b - a)) {
    const before = out.slice(0, at).replace(/\s+$/, '');
    const sep = before.endsWith('{') ? '' : ',';
    out = `${before}${sep}"offers":${JSON.stringify(offer)}${out.slice(before.length)}`;
  }
  JSON.parse(out); // never write a block that no longer parses
  return { text: out, added: inserts.length, products, unparsed: false };
}

/** Repair every JSON-LD block in one HTML document. */
export function repairHtml(html, offer = bhpcOffer()) {
  let added = 0;
  let products = 0;
  const unparsed = [];
  const out = html.replace(LD_RE, (all, open, body, close) => {
    const r = repairJsonLd(body, offer);
    added += r.added;
    products += r.products;
    if (r.unparsed) unparsed.push(body.slice(0, 80));
    return r.added ? `${open}${r.text}${close}` : all;
  });
  return { html: out, added, products, unparsed };
}

function main() {
  const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--check') ? 'check' : null;
  if (!mode) { console.error('usage: product_offers.mjs --apply | --check'); process.exit(2); }
  const offer = bhpcOffer();
  let products = 0;
  const changed = [];
  const unplaced = [];
  const frozen = frozenRevenueSurfaces();
  for (const rel of publishedHtml()) {
    if (frozen.has(rel)) continue;
    const file = path.join(ROOT, rel);
    const html = fs.readFileSync(file, 'utf8');
    if (!html.includes('Product')) continue;
    const r = repairHtml(html, offer);
    products += r.products;
    let next = r.html;
    let note = r.added ? `+${r.added} offers` : '';
    // Every price a page claims must also be a price a reader can see (c5).
    // A page that already states its prices - the A Player Mode plan page does -
    // is left exactly as it is.
    const hidden = claimedOfferPrices(next).filter((price) => !priceIsVisible(next, price));
    if (hidden.length) {
      const v = applyVisiblePrice(next, offer);
      if (!v.placed) unplaced.push(`${rel} (${hidden.join(', ')})`);
      if (v.changed) { next = v.html; note = note ? `${note}, visible price` : 'visible price'; }
      const left = claimedOfferPrices(v.html).filter((price) => !priceIsVisible(v.html, price));
      if (v.placed && left.length) unplaced.push(`${rel}: still hides ${left.join(', ')}`);
    }
    if (next !== html) {
      changed.push(`${rel} (${note})`);
      if (mode === 'apply') fs.writeFileSync(file, next);
    }
  }
  if (unplaced.length) {
    console.error(`[repair:product-offers] FAIL: ${unplaced.length} page(s) claim an Offer price a reader still cannot see; the markup must not say what the page does not.`);
    for (const line of unplaced.slice(0, 20)) console.error(`  - ${line}`);
    process.exit(1);
  }
  if (!products) { console.error('[repair:product-offers] FAIL: zero Product nodes found in the published pages; nothing was examined.'); process.exit(1); }
  if (mode === 'check' && changed.length) {
    console.error(`[repair:product-offers] FAIL: ${changed.length} page(s) need the offer or its visible price; run npm run repair:product-offers`);
    for (const c of changed.slice(0, 20)) console.error(`  - ${c}`);
    process.exit(1);
  }
  console.log(`[repair:product-offers] ${mode === 'apply' ? `added offers to ${changed.length} page(s)` : 'OK'}; ${products} Product node(s) carry ${offer.price} ${offer.priceCurrency} at ${offer.url}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
