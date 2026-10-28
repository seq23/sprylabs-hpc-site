'use strict';
/**
 * Give every published page the complete social-card head and the icon links
 * (scripts/lib/social_tags.cjs).
 *
 * Runs twice, and is idempotent so that costs nothing: as the last phase of
 * scripts/repair/repair_dual_domain_metadata.js - so any lane that normalizes
 * page metadata also completes the cards - and again as the LAST step of
 * build:all:uncached. The second run is the one that matters: six page writers
 * follow repair:dual-domain-metadata in that chain (the navigation hubs, the
 * visible FAQ, the health boundary, the demand families, the FAQPage repair and
 * the product offers), and each writes its own partial head. 1,255 incomplete
 * cards across 2,264 pages, 25 Oct 2026, were all written after that phase ran.
 *
 * The values are read from the page's own final <title>, meta description and
 * canonical URL, so it must follow the snippet bounds: run any earlier and it
 * would copy a title the bounds pass then rewrites, leaving og:title disagreeing
 * with <title> on exactly the pages that needed shortening.
 *
 * Deterministic and idempotent: a page already carrying the right tag is not
 * rewritten; a tag present with the wrong value is replaced in place; a missing
 * one is inserted immediately before </head> in the order the module lists.
 *
 * Inserted tags are written in the form BeautifulSoup emits - attributes in
 * alphabetical order, self-closing - because several repairs in this build
 * re-serialize whole pages through it. Writing `property=... content=...>` left
 * 419 pages that the next build rewrote byte-for-byte to the same meaning,
 * which is drift to every guard that compares a tree to its rebuild.
 * download.html is frozen and never touched (the caller excludes it).
 *
 * Usage (standalone): node scripts/repair/complete_social_tags.cjs [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const { socialTagsFor } = require('../lib/social_tags.cjs');
const { listIndexablePages } = require('../lib/site_pages.js');
const B = require('../lib/search_snippet_bounds.cjs');

const ROOT = process.cwd();

function metaTagRe(keyName, keyValue) {
  return new RegExp(`<meta\\b(?=[^>]*\\b${keyName}=["']${keyValue}["'])[^>]*>`, 'i');
}
function linkTagRe(rel) {
  return new RegExp(`<link\\b(?=[^>]*\\brel=["']${rel}["'])[^>]*>`, 'i');
}
function headOf(html) {
  const end = html.search(/<\/head>/i);
  return end === -1 ? null : {head: html.slice(0, end), end};
}
// The value is delimited by the quote it opened with, not by the next quote of
// either kind: `content="... 'I'll' ..."` is one attribute.
function setAttr(tag, attr, value) {
  const re = new RegExp(`\\b${attr}=(["'])[\\s\\S]*?\\1`, 'i');
  if (re.test(tag)) return tag.replace(re, `${attr}="${B.escapeAttr(value)}"`);
  return tag.replace(/<(meta|link)\b/i, (m) => `${m} ${attr}="${B.escapeAttr(value)}"`);
}

/** Apply the full set to one page's HTML. Returns the new HTML (unchanged if already complete). */
function applyTo({root = ROOT, rel, html}) {
  const parts = headOf(html);
  if (!parts) return html;
  const {metas, iconLinks} = socialTagsFor({root, rel, html});
  let head = parts.head;
  const inserts = [];
  for (const [keyName, keyValue, value] of metas) {
    const re = metaTagRe(keyName, keyValue);
    const existing = head.match(re);
    if (existing) {
      const next = setAttr(existing[0], 'content', value);
      if (next !== existing[0]) head = head.replace(existing[0], next);
    } else {
      inserts.push(`<meta content="${B.escapeAttr(value)}" ${keyName}="${keyValue}"/>`);
    }
  }
  for (const [rev, href] of iconLinks) {
    if (!linkTagRe(rev).test(head)) inserts.push(`<link href="${href}" rel="${rev}"/>`);
  }
  if (!inserts.length && head === parts.head) return html;
  return head + (inserts.length ? `\n${inserts.join('\n')}\n` : '') + html.slice(parts.end);
}

function completeSocialTags({dryRun = false, root = ROOT} = {}) {
  // Indexable pages only: a noindex operator surface (/admin) is not a card
  // anyone shares, and the checklist samples what an engine can see.
  const pages = listIndexablePages(root).filter((rel) => !B.EXEMPT_PAGES.has(rel));
  const changed = [];
  for (const rel of pages) {
    const abs = path.join(root, rel);
    const before = fs.readFileSync(abs, 'utf8');
    const after = applyTo({root, rel, html: before});
    if (after === before) continue;
    changed.push(rel);
    if (!dryRun) fs.writeFileSync(abs, after);
  }
  return {scanned: pages.length, changed: changed.length, changed_paths: changed};
}

module.exports = {completeSocialTags, applyTo};

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const r = completeSocialTags({dryRun});
  // Rule 0: a pass that examined nothing has not proved anything.
  if (!r.scanned) {
    console.error('[complete-social-tags] FAIL: 0 published pages found; expected the whole published surface.');
    process.exit(1);
  }
  console.log(`[complete-social-tags] ${dryRun ? 'DRY RUN ' : ''}scanned=${r.scanned}; changed=${r.changed}`);
}
