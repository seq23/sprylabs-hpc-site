'use strict';

/**
 * The one serialization of <script id="CITATION_PAGE_SCHEMA">.
 *
 * Fourteen scripts emit or rewrite that block and they did not agree on how to
 * write it. The JS writers used JSON.stringify, which is compact. Two Python
 * writers used json.dumps with Python's default separators, which puts a space
 * after every comma and colon. scripts/content/build_visible_faq_sections.py
 * even documented the spaced form as "matching the neighbouring schema blocks
 * the Python writers produce" - but the Python writer next to it,
 * scripts/citation/apply_citation_program.py, passes separators=(',',':') and
 * is compact. So one build step rewrote a page's schema spaced and the next
 * rewrote it compact, with no editorial change between them.
 *
 * That is why `npm run build:all` on a clean checkout leaves ~2,200 pages
 * modified with nothing to review in the diff, and why a second build changes
 * them back. It never failed CI, which is why it survived; what it cost was
 * every real change in this repo being hidden inside a couple of thousand files
 * of whitespace.
 *
 * There is also a shape divergence in the same block: mainEntityOfPage was
 * written as {"@id": url} by apply_citation_program.py (707 pages), as a bare
 * url string by four renderers (187 pages), and as {"@type":"WebPage","@id":url}
 * by two more. All three are valid schema.org and they are not
 * interchangeable to a byte comparison, so they produce the same churn.
 *
 * One serializer, one shape. Every writer of this block goes through here, and
 * scripts/validation/validate_citation_schema_serialization.mjs fails the build
 * if a page on disk does not match what this function would have produced.
 *
 * The form is COMPACT and mainEntityOfPage is {"@id": canonical}, because that
 * is what is already on disk for the large majority of pages and what
 * scripts/render/render_comparison.js was deliberately aligned to in PR #24 so
 * an unscoped repair pass stays a no-op. Choosing the minority form would have
 * meant rewriting the majority to reach the same place.
 */

const SCHEMA_SCRIPT_ID = 'CITATION_PAGE_SCHEMA';

// Matches the whole block: opening tag, body, closing tag.
const SCHEMA_SCRIPT_RE = /(<script\b[^>]*\bid=["']CITATION_PAGE_SCHEMA["'][^>]*>)([\s\S]*?)(<\/script>)/i;

/**
 * Compact JSON, with `<` escaped so the payload can never close the script
 * element early. This is the only permitted rendering of the block's body.
 */
function serializeSchema(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** The one shape for mainEntityOfPage. */
function mainEntityOfPage(canonical) {
  return { '@id': canonical };
}

/** The canonical URL a mainEntityOfPage value points at, in any of its shapes. */
function mainEntityOfPageId(value) {
  if (!value) return null;
  return typeof value === 'string' ? value : (value['@id'] || null);
}

/** Render the complete script element. */
function renderSchemaScript(value) {
  return `<script id="${SCHEMA_SCRIPT_ID}" type="application/ld+json">${serializeSchema(value)}</script>`;
}

/**
 * Rewrite the block's body in place through the one serializer, leaving the
 * opening tag exactly as the page had it. Returns the html unchanged when the
 * page carries no such block.
 */
function replaceSchemaBody(html, value) {
  const m = SCHEMA_SCRIPT_RE.exec(html);
  if (!m) return html;
  return html.slice(0, m.index) + m[1] + serializeSchema(value) + m[3] + html.slice(m.index + m[0].length);
}

/**
 * download.html is the revenue surface and its bytes are frozen at a known
 * sha256. Its schema block predates this contract and is spaced; normalising it
 * would break the freeze, which is a harder contract than this one. It is
 * exempt BY NAME rather than by the validator quietly skipping unparseable
 * pages, so the exemption is visible and countable.
 */
const SERIALIZATION_EXEMPT = new Set(['download.html']);

module.exports = {
  SCHEMA_SCRIPT_ID,
  SCHEMA_SCRIPT_RE,
  SERIALIZATION_EXEMPT,
  serializeSchema,
  mainEntityOfPage,
  mainEntityOfPageId,
  renderSchemaScript,
  replaceSchemaBody,
};
