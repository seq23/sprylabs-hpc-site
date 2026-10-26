'use strict';
/**
 * One definition of "schema the visible page supports" (Search Readiness c5).
 *
 * The checklist's rule: "No schema that the visible page does not support" -
 * "Every FAQ question and every Offer price in the JSON-LD appears in the page's
 * visible text", because "markup without matching content is treated as
 * deceptive and can cost all rich results on the domain."
 *
 * On 25 Oct 2026, 12 of this site's 7,832 Question nodes asked something that
 * appeared nowhere on the page. No generator writes them: they are committed
 * text from earlier agent runs, written as the page title with a "?" added, or
 * as "How does <brand> answer <title>?" - a question no reader was ever shown.
 * scripts/content/build_visible_faq_sections.py already states the rule those
 * pages break: "An answer is page text, never new text. If a page has nothing to
 * say, it gets no FAQ. Skipping is the correct outcome; empty mainEntity is not."
 *
 * So an unsupported Question is removed, and a FAQPage left with no question is
 * removed with it - never left empty. Nothing is invented to justify the markup,
 * which is the only other way to close this and would be the deceptive one.
 *
 * Applied by scripts/repair/strip_unsupported_schema.cjs, guarded by
 * scripts/validators/validate_schema_supported.mjs. Both read the comparison
 * from here so the repair and its proof cannot disagree about what "visible"
 * means - the defect that let these 12 through a schema-parity check already in
 * the build.
 */

/**
 * The page's visible text, lowercased and whitespace-collapsed: markup, script
 * and style removed. This mirrors the audit's own reader
 * (src/shared/boss/searchReadiness/audit.mjs, visibleText) so a page that passes
 * here passes there.
 */
function visibleText(html) {
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** The audit compares the first 60 characters of the question, so so do we. */
const PROBE = 60;

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** True when this Question's text is on the page. */
function questionIsVisible(name, text) {
  const n = norm(name);
  if (!n) return true;
  return text.includes(n.slice(0, PROBE));
}

/**
 * True when this Offer's price is on the page. The audit strips a trailing
 * ".00" before looking, so "49.00" is satisfied by a visible "$49".
 */
function priceIsVisible(price, text) {
  if (price === undefined || price === null || price === '' || Number(price) === 0) return true;
  return text.includes(String(price).replace(/\.0+$/, ''));
}

const typesOf = (node) => [].concat(node?.['@type'] ?? []).map(String);
const isType = (node, t) => typesOf(node).includes(t);

module.exports = { visibleText, questionIsVisible, priceIsVisible, typesOf, isType, norm, PROBE };
