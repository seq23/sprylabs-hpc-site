'use strict';
/**
 * Give every published page a complete publisher Organization node
 * (scripts/lib/organization_node.cjs): name, url, logo, sameAs and the one
 * @id (the /spry-labs entity home), and point every reference at that @id.
 *
 * Search Readiness item c1. Ten generators each wrote their own partial
 * Organization and none of them wrote sameAs, so rather than edit ten writers
 * and wait for the eleventh, this completes the node wherever it is found - the
 * same answer item b6 got in scripts/repair/complete_social_tags.cjs.
 *
 * Runs in the same two places, and for the same reason: as the last phase of
 * scripts/repair/repair_dual_domain_metadata.js, and again as the last step of
 * build:all:uncached, after the page writers that follow that phase.
 *
 * Only OUR organization is completed. A node naming anyone else - a competitor
 * on a comparison page, a cited publisher - is left untouched: writing Spry
 * Labs' sameAs onto another company's node is a false claim, which is the harm
 * item c5 exists to refuse.
 *
 * Idempotent by construction: a JSON-LD block is re-serialized ONLY when a
 * field was actually filled in. A second run fills nothing, so it rewrites
 * nothing and the bytes are stable - which is what the extraction-surface guard
 * and every rebuild-parity check compare.
 *
 * The block's own formatting is preserved: a compact block stays compact, a
 * pretty-printed one keeps its indent. download.html is frozen and never
 * touched (EXEMPT_PAGES).
 *
 * Usage (standalone): node scripts/repair/complete_organization_node.cjs [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const O = require('../lib/organization_node.cjs');
const { listIndexablePages } = require('../lib/site_pages.js');
const B = require('../lib/search_snippet_bounds.cjs');

const ROOT = process.cwd();
const LD_RE = /(<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi;

/**
 * The indent the block was written with: 0 for a compact one-line payload, else
 * the width of the first nested indent. Keeping it means this repair does not
 * reformat 3,480 nodes the next guard then reports as drift.
 */
function indentOf(src) {
  const m = src.match(/\{\s*\n(\s+)/);
  if (!m) return 0;
  return m[1].replace(/\t/g, '  ').length;
}

/** Complete every own-Organization node in one page. Returns the new HTML. */
function applyTo({ html }) {
  let filledTotal = 0;
  const out = html.replace(LD_RE, (whole, open, body, close) => {
    const src = body.trim();
    if (!src) return whole;
    let payload;
    try { payload = JSON.parse(src); } catch { return whole; }
    let filled = 0;
    O.eachNode(payload, (node) => {
      if (!O.isOwnOrganization(node)) return;
      filled += O.completeOrganization(node).length;
    });
    // One entity, one @id: references to a legacy Spry Labs @id follow the node.
    filled += O.relinkOrganizationRefs(payload);
    O.eachNode(payload, (node) => { filled += O.completeSiteEntity(node) + O.separateFromForbidden(node); });
    if (!filled) return whole;
    filledTotal += filled;
    const indent = indentOf(src);
    const text = indent ? JSON.stringify(payload, null, indent) : JSON.stringify(payload);
    // Keep the whitespace the block had around its payload.
    const lead = body.slice(0, body.length - body.trimStart().length);
    const tail = body.slice(body.trimEnd().length);
    return `${open}${lead}${text}${tail}${close}`;
  });
  return { html: out, filled: filledTotal };
}

function completeOrganizationNodes({ root = ROOT, dryRun = false } = {}) {
  // aplayermode/index.html is outside the shared sites' indexes
  // (config/index_exclusions.json) but publishes the same Spry Labs node on
  // aplayermode.com, so it is completed here too.
  const pages = listIndexablePages(root).filter((rel) => !B.EXEMPT_PAGES.has(rel));
  if (fs.existsSync(path.join(root, 'aplayermode/index.html')) && !pages.includes('aplayermode/index.html')) pages.push('aplayermode/index.html');
  const changed = [];
  let filled = 0;
  for (const rel of pages) {
    const abs = path.join(root, rel);
    const before = fs.readFileSync(abs, 'utf8');
    const r = applyTo({ html: before });
    filled += r.filled;
    if (r.html === before) continue;
    changed.push(rel);
    if (!dryRun) fs.writeFileSync(abs, r.html);
  }
  return { scanned: pages.length, changed: changed.length, fields_filled: filled, changed_paths: changed };
}

module.exports = { completeOrganizationNodes, applyTo, indentOf };

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const r = completeOrganizationNodes({ dryRun });
  // Rule 0: a pass that examined nothing has proved nothing.
  if (!r.scanned) {
    console.error('[complete-organization-node] FAIL: 0 published pages found; expected the whole published surface.');
    process.exit(1);
  }
  console.log(`[complete-organization-node] ${dryRun ? 'DRY RUN ' : ''}scanned=${r.scanned}; changed=${r.changed}; fields_filled=${r.fields_filled}`);
}
