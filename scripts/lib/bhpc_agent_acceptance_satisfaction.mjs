/**
 * ONE definition of "this agent recommendation has been absorbed".
 *
 * THE DEFECT THIS EXISTS FOR.
 *
 * The plan builder and the trace each carried their own answer to the same
 * question, and they disagreed:
 *
 *   build_bhpc_agent_exact_implementation_plan.mjs  html.includes(needle)
 *       - exact substring, so an em dash, a curly quote or a capital letter
 *         made a satisfied requirement read as outstanding.
 *
 *   trace_bhpc_agent_exact_implementation.mjs       every word appears somewhere
 *       - token-wise containment, which any page on the topic passes whether or
 *         not the phrase was ever written.
 *
 * Measured on the manifest as committed at ae39ee266, over 946 REQUIRED
 * entries:
 *
 *   exact substring       821 satisfied, 125 outstanding
 *   normalized phrase     926 satisfied,  20 outstanding
 *   token-wise            940 satisfied,   6 outstanding
 *
 * So the plan was carrying 125 entries as outstanding while the trace called
 * 119 of them PASS. The two lanes each kept their own list and nothing linked
 * them - the portfolio's standard defect shape. The consequences were both
 * real:
 *
 *   - BHPC_BACKLOG_CARRY_LIMIT defaults to 120 and the residue was 125, so the
 *     carry was SATURATED by permanent false negatives. Genuinely outstanding
 *     work from a recent run could be crowded out entirely, which is a silent
 *     cap starving absorption.
 *   - The trace reported the work done, so nothing ever raised the alarm.
 *
 * WHY NORMALIZED PHRASE IS THE RIGHT ANSWER, and not a split-the-difference.
 *
 * Exact substring is wrong because the requirement is that the page SAYS the
 * phrase, not that it stores the agent's exact bytes: 105 of the 125 differed
 * only by typography the applier legitimately normalises when it renders.
 *
 * Token-wise is wrong because it does not require the words to be adjacent or
 * in order, so it cannot distinguish a page that answers the query from a page
 * that merely shares its vocabulary. It hid 14 genuinely outstanding items that
 * normalized-phrase still reports.
 *
 * Normalized phrase keeps word order and adjacency - it is strictly stronger
 * than token-wise - while ignoring case and punctuation. It is the weakest test
 * that still means "the page says this".
 */

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  mdash: '—', ndash: '–', hellip: '…',
};

/**
 * HTML entities back to the characters they stand for, BEFORE normalising.
 *
 * Without this the escaping is not typography that normalisation forgives - it
 * is extra alphanumerics that normalisation preserves. The applier writes every
 * required string through escapeHtml, so an apostrophe reaches the page as
 * `&#39;`, and "don&#39;t" normalises to "don 39 t" while the required string
 * "don't" normalises to "don t". Reproduced on this tree: six REQUIRED entries
 * of runs 2026-07-04 and 2026-08-01 whose queries contain an apostrophe were
 * rendered on their page, in full, and still read as outstanding.
 */
function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (full, name) => NAMED_ENTITIES[name.toLowerCase()] ?? full);
}

/** Case- and punctuation-insensitive form. Collapses runs of non-alphanumerics
 *  to a single space so an em dash, a hyphen and a space all compare equal. */
export function normalizeForAcceptance(value) {
  return decodeEntities(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when `haystack` says `needle` as a contiguous phrase, ignoring case and
 *  punctuation. An empty needle asserts nothing and is treated as satisfied,
 *  because a blank requirement is not evidence of missing work. */
export function saysPhrase(haystack, needle) {
  const phrase = normalizeForAcceptance(needle);
  if (!phrase) return true;
  return normalizeForAcceptance(haystack).includes(phrase);
}

/** Elements with no closing tag, so an attribute on them opens no subtree. */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** An element a browser does not paint and an extractor does not read. */
function isNonRenderedAttrs(attrs = '') {
  return /\shidden(?=[\s=>/]|$)/i.test(attrs)
    || /\saria-hidden\s*=\s*["']?\s*true/i.test(attrs)
    || /\sstyle\s*=\s*(["'])[^"']*display\s*:\s*none/i.test(attrs);
}

/**
 * The markup a browser actually renders: comments, script and style payloads,
 * and every `hidden` / `aria-hidden` / `display:none` subtree removed.
 *
 * THE FALSE-GREEN THIS CLOSES.
 *
 * The marker test below used to be a bare `html.includes(record_id)` over the
 * raw file. Two things in this repository put a record id into a file without
 * putting anything in front of a reader:
 *
 *   - apply_bhpc_agent_exact_implementation.mjs writes an APPEND-ONLY comment
 *     ledger, `<!-- bhpc-agent-records: ... -->`, deliberately placed outside
 *     the semantic section so it survives the section being rebuilt. It is
 *     never removed, for any reason, by anything.
 *   - the same applier writes `hidden` evidence spans and a
 *     `<script type="application/json" data-bhpc-agent-provenance>` payload.
 *
 * Reproduced on this tree before this function existed: deleting the ENTIRE
 * rendered `<section class="bhpc-agent-semantic-repair">` from
 * a-realistic-morning-routine-for-people-with-chaotic-days.html left
 * 2026-07-18-bhpc-030 reading `marker_found: true`, on the strength of the
 * comment alone. Every trace of the work could be removed from the page and
 * the acceptance predicate would still call it absorbed.
 *
 * That matters most at exactly the moment coverage is being repaired: re-route
 * 57 records onto their cited page and the comment ledger on that page would
 * happily report 946/946 while the reader still saw nothing. A number that can
 * be reached without changing the page is the defect this audit exists for.
 *
 * The bar this sets is the honest one available: the id must appear in markup
 * the browser keeps. The record id is a machine marker and is never reader
 * VISIBLE text by design - the applier carries it as `data-bhpc-agent-record`
 * / `data-bhpc-agent-records` on the rendered `<section>` - so the assertion is
 * that the marker rides on a rendered element. Delete the section and it goes
 * with it, which is precisely what the comment ledger could not do.
 */
export function readerRenderedMarkup(html = '') {
  const source = String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ');
  const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let out = '';
  let last = 0;
  let skipTag = null;
  let depth = 0;
  let match;
  while ((match = TAG.exec(source)) !== null) {
    const [full, closing, rawName, attrs, selfClose] = match;
    const name = rawName.toLowerCase();
    if (!skipTag) out += source.slice(last, match.index);
    last = match.index + full.length;
    if (skipTag) {
      if (name !== skipTag) continue;
      if (closing) { depth -= 1; if (depth <= 0) skipTag = null; }
      else if (!selfClose && !VOID_ELEMENTS.has(name)) depth += 1;
      continue;
    }
    if (!closing && isNonRenderedAttrs(attrs)) {
      if (selfClose || VOID_ELEMENTS.has(name)) continue;
      skipTag = name;
      depth = 1;
      continue;
    }
    out += full;
  }
  if (!skipTag) out += source.slice(last);
  return out;
}

/**
 * The single acceptance test. Returns a structured verdict so callers can
 * report WHY something is outstanding rather than just that it is.
 *
 * Every assertion is made against readerRenderedMarkup(), not the raw file, so
 * nothing here can be satisfied by a comment, a JSON provenance payload or a
 * hidden span. See that function for the false-green it closes.
 */
export function evaluateBhpcAcceptance(entry, html) {
  const missingStrings = [];
  const missingBlocks = [];
  const rendered = readerRenderedMarkup(html);

  const marker = String(entry?.record_id || entry?.id || '');
  const markerFound = !marker || rendered.includes(marker);

  for (const needle of Array.isArray(entry?.required_strings) ? entry.required_strings : []) {
    if (!saysPhrase(rendered, needle)) missingStrings.push(String(needle));
  }
  for (const type of Array.isArray(entry?.required_block_types) ? entry.required_block_types : []) {
    const found = rendered.includes(`data-bhpc-agent-block="${type}"`)
      || rendered.includes(`data-content-block="${type}"`);
    if (!found) missingBlocks.push(String(type));
  }

  const reasons = [];
  if (!markerFound) reasons.push('marker_absent');
  if (missingStrings.length) reasons.push(`required_string_absent:${missingStrings.length}`);
  if (missingBlocks.length) reasons.push(`required_block_absent:${missingBlocks.join(',')}`);

  return {
    satisfied: reasons.length === 0,
    marker_found: markerFound,
    missing_strings: missingStrings,
    missing_blocks: missingBlocks,
    reasons,
  };
}
