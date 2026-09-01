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

/** Case- and punctuation-insensitive form. Collapses runs of non-alphanumerics
 *  to a single space so an em dash, a hyphen and a space all compare equal. */
export function normalizeForAcceptance(value) {
  return String(value ?? '')
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

/**
 * The single acceptance test. Returns a structured verdict so callers can
 * report WHY something is outstanding rather than just that it is.
 *
 * `readFile` is injected so callers that already hold the HTML do not re-read
 * it, and so this stays testable without a filesystem.
 */
export function evaluateBhpcAcceptance(entry, html) {
  const missingStrings = [];
  const missingBlocks = [];

  const marker = String(entry?.record_id || entry?.id || '');
  const markerFound = !marker || html.includes(marker);

  for (const needle of Array.isArray(entry?.required_strings) ? entry.required_strings : []) {
    if (!saysPhrase(html, needle)) missingStrings.push(String(needle));
  }
  for (const type of Array.isArray(entry?.required_block_types) ? entry.required_block_types : []) {
    const found = html.includes(`data-bhpc-agent-block="${type}"`)
      || html.includes(`data-content-block="${type}"`);
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
