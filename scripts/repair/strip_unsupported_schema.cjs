'use strict';
/**
 * Remove FAQ schema the visible page does not support (Search Readiness c5).
 *
 * See scripts/lib/schema_supported.cjs for the rule and why removal, not
 * invention, is the fix. A Question whose text is nowhere on the page is
 * dropped; a FAQPage left with no mainEntity is dropped with it; a @graph left
 * with no node is left alone rather than emptied.
 *
 * Only Question nodes are touched. An Offer price that is not visible is NOT
 * silently deleted - the price is the revenue claim, and the right repair is to
 * show it (npm run repair:product-offers writes the visible sentence from the
 * same pinned offer that fills the JSON-LD). The validator reports an invisible
 * price as a failure so it reaches a person instead of being quietly dropped.
 *
 * Idempotent: a JSON-LD block is re-serialized only when a node was actually
 * removed, so a second run rewrites nothing and the bytes are stable.
 *
 * Usage (standalone): node scripts/repair/strip_unsupported_schema.cjs [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const S = require('../lib/schema_supported.cjs');
const { listIndexablePages } = require('../lib/site_pages.js');
const B = require('../lib/search_snippet_bounds.cjs');

const ROOT = process.cwd();
const LD_RE = /(<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi;

function indentOf(src) {
  const m = src.match(/\{\s*\n(\s+)/);
  return m ? m[1].replace(/\t/g, '  ').length : 0;
}

/** Drop unsupported Questions inside one node tree. Returns how many went. */
function pruneQuestions(node, text) {
  let removed = 0;
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    for (const key of Object.keys(n)) {
      const v = n[key];
      if (Array.isArray(v)) {
        const kept = v.filter((item) => {
          if (S.isType(item, 'Question') && !S.questionIsVisible(item?.name, text)) { removed += 1; return false; }
          return true;
        });
        if (kept.length !== v.length) n[key] = kept;
        kept.forEach(walk);
      } else if (v && typeof v === 'object') {
        if (S.isType(v, 'Question') && !S.questionIsVisible(v?.name, text)) { delete n[key]; removed += 1; continue; }
        walk(v);
      }
    }
  };
  walk(node);
  return removed;
}

/** A FAQPage with nothing left to ask is not a FAQPage. */
function dropEmptyFaqPages(payload) {
  let removed = 0;
  const isEmptyFaq = (n) => S.isType(n, 'FAQPage') && !([].concat(n.mainEntity ?? []).length);
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      for (let i = n.length - 1; i >= 0; i -= 1) {
        if (isEmptyFaq(n[i])) { n.splice(i, 1); removed += 1; } else walk(n[i]);
      }
      return;
    }
    for (const key of Object.keys(n)) {
      const v = n[key];
      if (Array.isArray(v)) { walk(v); continue; }
      if (v && typeof v === 'object') {
        if (isEmptyFaq(v)) { delete n[key]; removed += 1; continue; }
        walk(v);
      }
    }
  };
  // A top-level FAQPage that is now empty is reported, not deleted: removing the
  // whole payload would leave an empty <script> the next guard reads as drift.
  walk(payload);
  return removed;
}

function applyTo({ html }) {
  const text = S.visibleText(html);
  let questions = 0;
  let faqPages = 0;
  const out = html.replace(LD_RE, (whole, open, body, close) => {
    const src = body.trim();
    if (!src) return whole;
    let payload;
    try { payload = JSON.parse(src); } catch { return whole; }
    const q = pruneQuestions(payload, text);
    if (!q) return whole;
    const f = dropEmptyFaqPages(payload);
    questions += q;
    faqPages += f;
    const indent = indentOf(src);
    const textOut = indent ? JSON.stringify(payload, null, indent) : JSON.stringify(payload);
    const lead = body.slice(0, body.length - body.trimStart().length);
    const tail = body.slice(body.trimEnd().length);
    return `${open}${lead}${textOut}${tail}${close}`;
  });
  return { html: out, questions, faqPages };
}

function stripUnsupportedSchema({ root = ROOT, dryRun = false } = {}) {
  const pages = listIndexablePages(root).filter((rel) => !B.EXEMPT_PAGES.has(rel));
  const changed = [];
  let questions = 0;
  let faqPages = 0;
  for (const rel of pages) {
    const abs = path.join(root, rel);
    const before = fs.readFileSync(abs, 'utf8');
    const r = applyTo({ html: before });
    questions += r.questions;
    faqPages += r.faqPages;
    if (r.html === before) continue;
    changed.push(rel);
    if (!dryRun) fs.writeFileSync(abs, r.html);
  }
  return { scanned: pages.length, changed: changed.length, questions_removed: questions, faqpages_removed: faqPages, changed_paths: changed };
}

module.exports = { stripUnsupportedSchema, applyTo };

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const r = stripUnsupportedSchema({ dryRun });
  if (!r.scanned) {
    console.error('[strip-unsupported-schema] FAIL: 0 published pages found; expected the whole published surface.');
    process.exit(1);
  }
  console.log(`[strip-unsupported-schema] ${dryRun ? 'DRY RUN ' : ''}scanned=${r.scanned}; changed=${r.changed}; questions_removed=${r.questions_removed}; faqpages_removed=${r.faqpages_removed}`);
}
