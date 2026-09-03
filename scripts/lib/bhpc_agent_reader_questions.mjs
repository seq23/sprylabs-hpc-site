/**
 * ONE list of the reader-facing question strings an agent record puts on a page.
 *
 * THE DEFECT THIS EXISTS FOR - two components each keeping their own list, with
 * nothing linking them.
 *
 *   scripts/lib/bhpc_agent_acceptance_parser.mjs
 *       required_strings = unique([query, heading])
 *
 *   scripts/agent_intake/apply_bhpc_agent_exact_implementation.mjs
 *       renders cleanRequiredHeading(required_heading) as the <h2>, and other
 *       entries' headings in the "Related reader questions" aside.
 *
 * Nothing rendered the QUERY. For most records that was invisible, because
 * deriveBhpcRequiredHeading falls back to the query and the two strings are
 * equal. Where they differ, the acceptance predicate demanded a string no
 * component in the repository ever wrote, so those entries could not clear on
 * any run, on any page, ever. Measured on this tree: 20 REQUIRED entries of
 * runs 2026-06-27 and 2026-07-04 across four pages, permanently outstanding.
 *
 * This module is the link. The applier renders exactly what
 * `bhpcReaderQuestionCandidates` returns, so a required string is a string
 * something actually writes.
 *
 * WHAT IS DELIBERATELY *NOT* PUBLISHED, and why the requirement still stands.
 *
 * A few query cells transcribe a repository artifact rather than a question a
 * reader would type - "what is README - Spry Executive OS", derived from the
 * FILENAME of insights/README.html, whose published title is "How to Use the
 * Spry Executive OS Insights Library". Rendering that under "Related reader
 * questions" puts a filename in front of a reader, which is the same defect
 * this applier already refuses twice over (see the recommendation_summary and
 * definition_callout branches, where operator-facing text was published as
 * reader copy on 28 and 42 live pages respectively).
 *
 * So those are not published - and they are NOT dropped from required_strings
 * either. Dropping them would be buying coverage by deleting the requirement.
 * They stay REQUIRED, stay unsatisfied, and stay named in
 * data/report_fixes/agent_absorption_reader_coverage_budget.json with this
 * reason, which is what a budget that only shrinks is for.
 */

/**
 * A required_heading is transcribed from an audit row, and a few of them carry
 * the shape the page was asked to take rather than the name of the thing:
 * "The 3-Part Email System with H3s for Filter Batch and Triage each with 2-3
 * sentence definitions". Published as an <h2>, that is a reader looking at the
 * brief instead of the page. Keep the subject, drop the layout instruction.
 */
export function cleanBhpcReaderHeading(value = '') {
  return String(value ?? '')
    .replace(/\s+with\s+(?:numbered\s+)?h[1-6]s?\b[\s\S]*$/i, '')
    .replace(/\s+each\s+with\s+[\d–-]+\s*(?:to\s*\d+\s*)?sentences?\b[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A query cell that names a repository file or route instead of a subject.
 * Narrow on purpose: a filename token, an .html extension, or a path separator.
 * Anything else is treated as a real reader question, however ungainly it
 * reads - "AI Coach vs Human Coach for Founders worth it" is a search string
 * someone typed, and this site exists to answer search strings.
 */
const REPO_ARTIFACT_QUERY = /\breadme\b|\.html\b|\//i;

export function isPublishableBhpcReaderQuestion(value = '') {
  const text = cleanBhpcReaderHeading(value);
  if (text.length < 8) return false;
  return !REPO_ARTIFACT_QUERY.test(text);
}

/** Display form: the cleaned string, sentence-cased. Acceptance normalises case
 *  and punctuation, so capitalising cannot break the match it has to satisfy. */
export function bhpcReaderQuestionText(value = '') {
  const text = cleanBhpcReaderHeading(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/**
 * Every reader-facing question string these acceptance entries put on the page:
 * each entry's heading, and each entry's query where the query is publishable.
 * Returned in display form, de-duplicated case-insensitively, order preserved.
 */
export function bhpcReaderQuestionCandidates(entries = []) {
  const seen = new Set();
  const out = [];
  const push = (value) => {
    const text = bhpcReaderQuestionText(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    out.push(text);
  };
  for (const entry of entries) push(entry?.required_heading);
  for (const entry of entries) {
    if (isPublishableBhpcReaderQuestion(entry?.query)) push(entry.query);
  }
  return out;
}
