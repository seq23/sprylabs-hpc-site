export const BHPC_PRODUCT_ANCHOR_SENTENCE = 'This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner.';

export function bhpcGeneratedCitationDefinition(query = '') {
  return `${String(query || '').trim()} is addressed with a direct answer, practical decision criteria, and a clear next step.`.slice(0, 520);
}

/**
 * A shape-legal FRAMEWORK NAME for a page that has no curated one.
 *
 * ─── THE DEFECT ────────────────────────────────────────────────────────────
 *
 * build_bhpc_agent_exact_implementation_plan.mjs falls back to the agent's
 * `required_heading` - a raw search query - when no curated name exists. For an
 * EXISTING page that is fine, because curation covers the ones that matter. For a
 * page the artifact CREATES there is no curated entry by definition, so the fallback
 * is always the query, and validate:framework-name-shape refuses it:
 *
 *   insights/identify-unmet-needs-...: "identify unmet needs in the market that my
 *     competitor hasn't addressed yet" - entirely lowercase, which is how a raw
 *     search query reads
 *
 * That guard carries a shrink-only baseline of 234 pre-existing debts, so every new
 * page created this way is a REGRESSION against it. Three arrived on 2026-09-12 and
 * took Validate Repo's shard-2 red.
 *
 * ─── WHAT THIS DOES, AND WHAT IT REFUSES TO DO ─────────────────────────────
 *
 * It reads a noun phrase out of the query - dropping the leading imperative verb and
 * the trailing qualifying clause - and title-cases it, so the result is the same
 * shape as the curated names already in the tree ("Arbitration Engine", "AI Execution
 * Atlas"). Articles and prepositions stay lowercase, which is what makes it read as a
 * name rather than a shouted query.
 *
 * It does NOT truncate mid-phrase. This repo has published "State of A Simple Meeting
 * Rule That Prevents Calendar Cha" from a fixed-offset slice, and a name cut mid-word
 * is worse than a name that is merely plain. If no legal name can be read out, it
 * returns '' and the caller keeps its existing behaviour - a curated entry is then the
 * honest fix, and the shape guard will say so by name.
 *
 * CURATION STILL WINS. This is the floor, not the authority.
 */
const LEADING_VERBS = new Set([
  'identify', 'rehearse', 'start', 'create', 'build', 'make', 'find', 'write', 'plan',
  'help', 'show', 'give', 'tell', 'explain', 'describe', 'compare', 'choose', 'decide',
  'run', 'set', 'use', 'get', 'do', 'how', 'what', 'why', 'when', 'should', 'can',
]);
/** Where a qualifying clause begins. Everything from here is context, not the name. */
const CLAUSE_STARTS = [
  'that', 'which', 'based on', 'without', 'every', 'when i', 'when my', 'so that',
  'in order to', 'while', 'after', 'before', 'if i', 'for my', 'with my',
];
const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'as', 'me', 'my']);
const MAX_NAME_WORDS = 8;

export function bhpcGeneratedFrameworkName(query = '') {
  let v = String(query || '').trim().replace(/[?.!]+$/, '');
  if (!v) return '';

  // Cut at the first qualifying clause, on a WORD boundary only.
  const lower = v.toLowerCase();
  let cut = v.length;
  for (const marker of CLAUSE_STARTS) {
    const at = lower.indexOf(` ${marker} `);
    if (at >= 0 && at < cut) cut = at;
  }
  v = v.slice(0, cut).trim();

  let words = v.split(/\s+/).filter(Boolean);
  while (words.length && LEADING_VERBS.has(words[0].toLowerCase())) words.shift();
  while (words.length && SMALL_WORDS.has(words[0].toLowerCase())) words.shift();

  // Too long to be a name, and shortening it would cut a phrase in half. Say so by
  // returning nothing rather than shipping a severed one.
  if (!words.length || words.length > MAX_NAME_WORDS) return '';

  const titled = words
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase())
      ? w.toLowerCase()
      : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

  // A name that is still entirely lowercase (all small words) is not a name.
  return titled === titled.toLowerCase() ? '' : titled;
}
