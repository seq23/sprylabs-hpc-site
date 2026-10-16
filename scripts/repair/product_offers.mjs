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
 * block keep their bytes. Reviews and ratings are never added.
 *
 *   node scripts/repair/product_offers.mjs --apply   rewrite pages that need it
 *   node scripts/repair/product_offers.mjs --check   exit 1 if any page needs it
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
  for (const rel of publishedHtml()) {
    const file = path.join(ROOT, rel);
    const html = fs.readFileSync(file, 'utf8');
    if (!html.includes('Product')) continue;
    const r = repairHtml(html, offer);
    products += r.products;
    if (r.added) {
      changed.push(`${rel} (+${r.added})`);
      if (mode === 'apply') fs.writeFileSync(file, r.html);
    }
  }
  if (!products) { console.error('[repair:product-offers] FAIL: zero Product nodes found in the published pages; nothing was examined.'); process.exit(1); }
  if (mode === 'check' && changed.length) {
    console.error(`[repair:product-offers] FAIL: ${changed.length} page(s) carry a Product with no offers; run npm run repair:product-offers`);
    for (const c of changed.slice(0, 20)) console.error(`  - ${c}`);
    process.exit(1);
  }
  console.log(`[repair:product-offers] ${mode === 'apply' ? `added offers to ${changed.length} page(s)` : 'OK'}; ${products} Product node(s) carry ${offer.price} ${offer.priceCurrency} at ${offer.url}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
