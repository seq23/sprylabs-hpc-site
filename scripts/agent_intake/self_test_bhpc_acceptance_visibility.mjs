#!/usr/bin/env node
/**
 * The acceptance predicate must not be satisfiable without changing the page.
 *
 * WHAT THIS GUARDS, and how it was found.
 *
 * evaluateBhpcAcceptance used to test the marker with a bare
 * `html.includes(record_id)` over the raw file. Three things in this repository
 * put a record id into a file without putting anything in front of a reader:
 *
 *   1. the APPEND-ONLY comment ledger `<!-- bhpc-agent-records: ... -->`, which
 *      apply_bhpc_agent_exact_implementation.mjs deliberately writes OUTSIDE
 *      the semantic section so it survives the section being rebuilt, and which
 *      nothing ever removes;
 *   2. the `hidden` evidence spans written by renderBhpcRecordEvidence;
 *   3. the `<script type="application/json" data-bhpc-agent-provenance>`
 *      payload written beside them.
 *
 * Reproduced on the tree before the fix: deleting the ENTIRE rendered
 * `<section class="bhpc-agent-semantic-repair">` from a live page left its
 * records reading `marker_found: true`. Coverage could therefore be driven to
 * 946/946 with the reader seeing nothing - the exact false-green the reader
 * coverage audit exists to eliminate, and the reason this file runs before the
 * coverage number is quoted anywhere.
 *
 * The second case is the inverse failure: a required string that IS on the page
 * reading as absent because the applier escaped it. Every string the applier
 * writes goes through escapeHtml, so an apostrophe reaches the page as `&#39;`,
 * and "don&#39;t" normalised to "don 39 t" while the requirement "don't"
 * normalised to "don t". Six REQUIRED entries were rendered in full and still
 * counted as outstanding.
 *
 * Rule 0: the case table is walked and counted, and a run that asserted nothing
 * fails rather than reporting a clean sheet over an empty loop.
 */
import assert from 'node:assert/strict';
import {
  evaluateBhpcAcceptance,
  normalizeForAcceptance,
  readerRenderedMarkup,
} from '../lib/bhpc_agent_acceptance_satisfaction.mjs';

const RECORD = '2026-07-18-bhpc-030';
const page = (body) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

// The three ways the applier records a marker WITHOUT rendering anything, each
// exactly as it appears on disk today.
const LEDGER_COMMENT = `<!-- bhpc-agent-records: 2026-07-18-bhpc-001 ${RECORD} -->`;
const HIDDEN_EVIDENCE = `<span class="bhpc-agent-record-evidence" hidden data-bhpc-agent-evidence="true" data-bhpc-agent-record="${RECORD}"><span hidden data-bhpc-agent-record="${RECORD}"></span></span>`;
const PROVENANCE_SCRIPT = `<script type="application/json" data-bhpc-agent-provenance>{"record_ids":["${RECORD}"]}</script>`;
// And the one way it renders it: on the section that carries the copy.
const RENDERED_SECTION = `<section class="bhpc-agent-semantic-repair" data-bhpc-agent-record="${RECORD}" data-bhpc-agent-records="${RECORD}"><h2>Heading</h2><p>Body copy.</p></section>`;

const cases = [
  ['comment ledger alone does not satisfy the marker', page(LEDGER_COMMENT), false],
  ['hidden evidence spans alone do not satisfy the marker', page(HIDDEN_EVIDENCE), false],
  ['a JSON provenance payload alone does not satisfy the marker', page(PROVENANCE_SCRIPT), false],
  ['all three machine-only carriers together do not satisfy the marker',
    page(`${HIDDEN_EVIDENCE}${PROVENANCE_SCRIPT}${LEDGER_COMMENT}`), false],
  ['an aria-hidden subtree does not satisfy the marker',
    page(`<div aria-hidden="true"><span data-bhpc-agent-record="${RECORD}"></span></div>`), false],
  ['a display:none subtree does not satisfy the marker',
    page(`<div style="display:none"><span data-bhpc-agent-record="${RECORD}"></span></div>`), false],
  ['the rendered semantic section DOES satisfy the marker', page(RENDERED_SECTION), true],
  ['the rendered section still satisfies it alongside the machine-only carriers',
    page(`${RENDERED_SECTION}${HIDDEN_EVIDENCE}${PROVENANCE_SCRIPT}${LEDGER_COMMENT}`), true],
];

let asserted = 0;
for (const [label, html, expected] of cases) {
  const verdict = evaluateBhpcAcceptance({ record_id: RECORD, required_strings: [], required_block_types: [] }, html);
  assert.equal(verdict.marker_found, expected, `${label}: expected marker_found=${expected}`);
  assert.equal(verdict.satisfied, expected, `${label}: expected satisfied=${expected}`);
  asserted += 1;
}

// The negative proof stated as its own case: erase only the rendered section
// and the verdict must flip, which is what the bare-substring test could not do.
const withSection = page(`${RENDERED_SECTION}${LEDGER_COMMENT}`);
const withoutSection = withSection.replace(RENDERED_SECTION, '');
assert.equal(evaluateBhpcAcceptance({ record_id: RECORD }, withSection).marker_found, true);
assert.equal(evaluateBhpcAcceptance({ record_id: RECORD }, withoutSection).marker_found, false,
  'removing the rendered section while keeping the append-only comment ledger MUST flip the verdict');
asserted += 2;

// Required strings are held to the same bar, and are not defeated by escaping.
const stringCases = [
  ['a required string in a comment does not count',
    page(`<!-- how do i make sure i don't quit running this year -->`), false],
  ['a required string in a hidden span does not count',
    page(`<span hidden>how do i make sure i don't quit running this year</span>`), false],
  ['an escaped apostrophe still matches the unescaped requirement',
    page('<p>How do i make sure i don&#39;t quit running this year</p>'), true],
  ['a curly-quote entity still matches the straight-quote requirement',
    page('<p>How do i make sure i don&rsquo;t quit running this year</p>'), true],
  ['visible plain text matches',
    page("<p>How do i make sure i don't quit running this year</p>"), true],
];
for (const [label, html, expected] of stringCases) {
  const verdict = evaluateBhpcAcceptance(
    { record_id: '', required_strings: ["how do i make sure i don't quit running this year"] },
    html,
  );
  assert.equal(verdict.satisfied, expected, `${label}: expected satisfied=${expected}`);
  asserted += 1;
}

// Required block types are held to the same bar.
const blockEntry = { record_id: '', required_block_types: ['definition_callout'] };
assert.equal(evaluateBhpcAcceptance(blockEntry, page('<!-- data-bhpc-agent-block="definition_callout" -->')).satisfied, false);
assert.equal(evaluateBhpcAcceptance(blockEntry, page('<aside data-bhpc-agent-block="definition_callout"><p>x</p></aside>')).satisfied, true);
asserted += 2;

// Unit-level checks on the two helpers, so a regression names its own cause.
assert.equal(readerRenderedMarkup('<!-- x -->a').trim(), 'a');
assert.equal(readerRenderedMarkup('<span hidden>a</span>b').trim(), 'b');
assert.equal(readerRenderedMarkup('<div hidden><div>a</div></div>b').trim(), 'b',
  'nested elements of the same tag inside a hidden subtree must not leak out of it');
assert.equal(normalizeForAcceptance('don&#39;t'), normalizeForAcceptance("don't"));
assert.equal(normalizeForAcceptance('a&amp;b'), normalizeForAcceptance('a & b'));
asserted += 5;

// Rule 0. No stage may exit 0 having done nothing.
if (asserted < cases.length + stringCases.length) {
  console.error('[bhpc-acceptance-visibility-self-test] FAIL: examined fewer cases than declared (Rule 0)');
  process.exit(1);
}
console.log(`[bhpc-acceptance-visibility-self-test] PASS: ${asserted} assertion(s); the acceptance predicate cannot be satisfied by a comment, a script payload or a hidden element`);
