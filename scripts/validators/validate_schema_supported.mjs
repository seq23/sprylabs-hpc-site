/**
 * No schema the visible page does not support (Search Readiness checklist c5).
 *
 * Every FAQ question and every priced Offer in the JSON-LD must appear in the
 * page's visible text. "Markup without matching content is treated as deceptive
 * and can cost all rich results on the domain."
 *
 * What it refuses, measured on 25 Oct 2026: 12 of 7,832 Question nodes asked
 * something that was nowhere on the page - the page title with a "?" added, or
 * "How does <brand> answer <title>?", a question no reader was ever shown. A
 * schema-parity check already in the build did not see them, because it reads
 * the registry of citable pages and the FAQ block the visible-FAQ builder
 * writes; these questions were committed by earlier agent runs and belonged to
 * neither. This reads the whole indexable surface instead, and shares its
 * definition of "visible" with the repair (scripts/lib/schema_supported.cjs) so
 * the two cannot disagree.
 *
 * An invisible Offer price is a failure here rather than something the repair
 * deletes: the price is the revenue claim, so it has to reach a person. The fix
 * is to show it (npm run repair:product-offers).
 *
 * Rule 0: a run that examined no pages, or found no Question nodes at all on a
 * site built around FAQ markup, fails.
 *
 * Run: npm run validate:schema-supported
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const S = require_('../lib/schema_supported.cjs');
const { listIndexablePages } = require_('../lib/site_pages.js');
const B = require_('../lib/search_snippet_bounds.cjs');

const ROOT = process.cwd();
const LABEL = '[validate:schema-supported]';
const LD_RE = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

const failures = [];
const pages = listIndexablePages(ROOT).filter((rel) => !B.EXEMPT_PAGES.has(rel));
let questions = 0;
let offers = 0;
let emptyFaq = 0;

const each = (payload, visit) => {
  const stack = [payload];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object') continue;
    if (Array.isArray(n)) { stack.push(...n); continue; }
    visit(n);
    for (const v of Object.values(n)) if (v && typeof v === 'object') stack.push(v);
  }
};

for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const text = S.visibleText(html);
  for (const m of html.matchAll(LD_RE)) {
    const src = m[1].trim();
    if (!src) continue;
    let payload;
    try { payload = JSON.parse(src); } catch (e) { failures.push(`${rel}: JSON-LD does not parse (${e.message})`); continue; }
    each(payload, (node) => {
      if (S.isType(node, 'Question')) {
        questions += 1;
        if (!S.questionIsVisible(node.name, text)) failures.push(`${rel}: FAQ "${S.norm(node.name).slice(0, 40)}" is not visible on the page`);
      }
      if (S.isType(node, 'Offer') || S.isType(node, 'AggregateOffer')) {
        const price = node.price ?? node.lowPrice;
        if (price !== undefined && price !== null && price !== '' && Number(price) !== 0) {
          offers += 1;
          if (!S.priceIsVisible(price, text)) failures.push(`${rel}: schema price ${price} is not on the page (npm run repair:product-offers)`);
        }
      }
      // An empty FAQPage is the other dishonest shape: markup claiming a Q&A
      // surface with nothing in it.
      if (S.isType(node, 'FAQPage') && !([].concat(node.mainEntity ?? []).length)) {
        emptyFaq += 1;
        failures.push(`${rel}: FAQPage with no mainEntity; a page with nothing to ask carries no FAQPage`);
      }
    });
  }
}

if (!pages.length) failures.push('Rule 0: 0 published pages found; expected the whole published surface');
if (!questions) failures.push('Rule 0: 0 Question nodes examined; this site is built around FAQ markup, so that is a broken reader, not a clean result');

for (const m of failures.slice(0, 20)) console.error(`${LABEL} FAIL ${m}`);
if (failures.length > 20) console.error(`${LABEL} FAIL ... and ${failures.length - 20} more`);
if (failures.length) {
  console.error(`${LABEL} FAIL (${failures.length}) - ${pages.length} pages, ${questions} questions, ${offers} priced offers`);
  process.exit(1);
}
console.log(`${LABEL} PASS - ${pages.length} pages: ${questions} FAQ questions all visible, ${offers} priced offers all shown, ${emptyFaq} empty FAQPages`);
