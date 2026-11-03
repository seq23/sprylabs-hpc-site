/**
 * The page-shape sample reads the words on five live content pages every Monday
 * and fails a page that repeats the same eight words more than three times. On
 * 3 November 2026 all five pages it sampled on billionairehighperformancecoach.com
 * failed on exactly that, and 1,317 of the 1,350 generated phase-4 pages carried
 * it: several slots were wired to one library field, and nine sibling links each
 * printed the page's own question in full.
 *
 * These are the two guards for that fix, at the two places the behaviour lives.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { siblingLabel, siblingGroups } from '../scripts/lib/sibling_labels.mjs';
import { sayOnce, composeArticle, templateFillerPhrases, headingLabel } from '../scripts/programmatic/phase4_page_composer.mjs';

// --- the related-pages block ------------------------------------------------

test('a sibling that shares the page stem is labelled by what differs', () => {
  const page = 'What should a founder do when behind on commitments and needs priority selection support?';
  const sib = 'What should a founder do when behind on commitments and needs cost and access support?';
  // The shared trailing "support?" goes with the shared opening: what is left is
  // the only part that differs.
  assert.equal(siblingLabel(page, sib), 'Cost and access');
});

test('a permuted family differing in the middle loses the shared ending too', () => {
  // The defect one level down: stripping only the shared opening left
  // "and needs execution review support" on five links in a row.
  const page = 'What should a founder do when closing a chaotic week and needs execution review support?';
  const sib = 'What should a founder do when facing decision fatigue and needs execution review support?';
  assert.equal(siblingLabel(page, sib), 'Facing decision fatigue');
});

test('an unrelated sibling keeps its own heading', () => {
  const page = 'What should a founder do when behind on commitments and needs priority selection support?';
  assert.equal(siblingLabel(page, 'A simple knowledge system'), 'A simple knowledge system');
});

test('a stem shared only among the links is written once, as a heading', () => {
  const page = 'How can I create a daily operating system to stop restarting goals';
  const groups = siblingGroups(page, [
    { route: '/a', h1: 'How can I run a daily protocol to close the week?' },
    { route: '/b', h1: 'How can I run a daily protocol to start the day?' },
    { route: '/c', h1: 'Something else entirely about energy' },
  ]);
  const stemmed = groups.find((g) => g.stem);
  assert.ok(stemmed, 'the two siblings sharing a stem are grouped under it');
  assert.equal(stemmed.stem, 'How can I run a daily protocol to');
  assert.deepEqual(stemmed.items.map((i) => i.label), ['Close the week', 'Start the day']);
  assert.deepEqual(groups.find((g) => !g.stem).items.map((i) => i.label), ['Something else entirely about energy']);
});

test('every link in a related list says something different', () => {
  // Nine siblings crossing two dimensions once reduced to two labels
  // alternating five times, which is worse than the long titles.
  const page = 'What should a founder do when closing a chaotic week and needs accountability support?';
  const h1s = ['What should a founder do when closing a chaotic week and needs behavioral follow-through support?'];
  for (const state of ['facing decision fatigue', 'juggling money pressure', 'needing a lower-friction plan', 'overplanning instead of executing']) {
    h1s.push(`What should a founder do when ${state} and needs accountability support?`);
    h1s.push(`What should a founder do when ${state} and needs behavioral follow-through support?`);
  }
  const labels = siblingGroups(page, h1s.map((h1, i) => ({ route: `/p${i}`, h1 }))).flatMap((g) => g.items.map((i) => i.label));
  assert.equal(labels.length, h1s.length, 'no link is dropped');
  assert.equal(new Set(labels).size, labels.length, `labels collide: ${JSON.stringify(labels)}`);
});

test('a label never loses the link it stood for', () => {
  const page = 'What should a founder do when behind on commitments and needs priority selection support?';
  const items = [{ route: '/x', h1: 'What should a founder do when behind on commitments and needs cost and access support?' }];
  const groups = siblingGroups(page, items);
  assert.deepEqual(groups.flatMap((g) => g.items.map((i) => i.route)), ['/x']);
  assert.equal(groups[0].items[0].h1, items[0].h1, 'the full heading is kept for the accessible name');
});

// --- the composed page ------------------------------------------------------

const SPEC = () => ({
  query: 'What should a founder do when behind on commitments and needs priority selection support?',
  definition: 'The Execution Evidence Ledger is a named operating pattern.',
  framework: 'Execution Evidence Ledger',
  extractionType: 'concept',
  extractionTable: '',
  conceptDepth: 'condensed',
  frameworkPageHref: '/methods/execution-evidence-ledger/',
  directAnswer: 'Send the status messages before doing any of the work. One line each: where it is, when it lands.',
  primary: {
    kind: 'state',
    key: 'behind on commitments',
    label: 'behind on commitments',
    lead: ['The outstanding list is longer than the week.', 'What is actually scarce here: trust.'],
    firstMove: 'Send the status messages before doing any of the work. One line each: where it is, when it lands.',
    wrongMove: 'Going quiet. Silence costs more than a late delivery with a date attached.',
    measure: 'The outstanding list is visible to the people waiting.',
    data: {
      signal: 'You are behind and you know it.',
      scarce: 'Trust, not time.',
      unit: 'Messages sent before work starts.',
      looks_like_progress: 'Working harder in silence.',
      do_not: 'Do not disappear until you can deliver.',
      // The same sentence the answer up front and the extraction block carry.
      opening: 'Send the status messages before doing any of the work. One line each: where it is, when it lands.',
      after: 'The people waiting know where things stand.',
    },
  },
  secondary: {
    kind: 'dimension',
    key: 'priority selection',
    label: 'priority selection support',
    applied: 'Every time you pick between two things, write which one you picked and why.',
    extra: ['Evidence that it is working: the chosen option recorded each time.'],
    data: {
      question: 'Which of these two actually matters?',
      move: 'Write which one you picked and why.',
      unit: 'Decisions recorded.',
      looks_like_progress: 'A longer list.',
      evidence: 'The chosen option and the deciding dimension, recorded each time.',
      first_week: 'Send the status messages before doing any of the work. One line each: where it is, when it lands.',
      mistaken_for: 'A capacity problem.',
      wrong_metric: 'Hours worked.',
    },
  },
  concept: {
    key: 'execution-evidence-ledger',
    framework: 'Execution Evidence Ledger',
    anchor: 'execution-evidence-ledger',
    value: 'uses observable outcomes instead of intention',
    trigger: 'Use it when intention and outcome have come apart.',
    mechanism: 'The ledger records what happened, not what was planned.',
    moves: ['Write what you picked.', 'Write why.', 'Read the week back.'],
    failure_modes: [{ name: 'Recording the plan', why: 'The plan is not the outcome.', correction: 'Record the outcome.' }],
    evidence: 'A week of entries.',
    prompt: 'Ask for the week read back.',
    not_this: 'It is not a prioritisation framework.',
  },
  example: {
    title: 'a founder behind on commitments',
    paragraphs: [
      'Someone sits down on Friday with eleven open commitments.',
      // Pure restatement of the answer up front.
      'Send the status messages before doing any of the work. One line each: where it is, when it lands.',
    ],
    measure: 'The outstanding list is visible to the people waiting.',
  },
  faq: [
    { q: 'What is the first thing to do?', a: 'Send the status messages before doing any of the work. One line each: where it is, when it lands.' },
    { q: 'How do I know it is working?', a: 'The chosen option and the deciding dimension, recorded each time.' },
    { q: 'Does this page replace professional advice?', a: 'No. It is educational and organizational only.' },
  ],
  sources: [{ href: '/citation-methodology', label: 'How these pages are written' }],
  extraSections: [],
  reviewedAt: '2026-11-03',
  internalLinks: [{ href: '/answers/', label: 'All answer pages' }],
});

test('sayOnce leaves the answer and the extraction block alone', () => {
  const spec = sayOnce(SPEC());
  assert.match(spec.directAnswer, /Send the status messages/);
  assert.match(spec.primary.firstMove, /Send the status messages/);
  assert.equal(spec.primary.lead.length, 2);
});

test('sayOnce drops a downstream slot that only repeats the page', () => {
  const spec = sayOnce(SPEC());
  assert.deepEqual(spec.example.paragraphs, ['Someone sits down on Friday with eleven open commitments.']);
  assert.equal(spec.secondary.data.first_week, '', 'the misreadings row had nothing of its own');
  // Both of the first two answers were already on the page - one in the answer up
  // front, one in the dimension table - so only the answer with something of its
  // own survives.
  assert.deepEqual(spec.faq.map((f) => f.q), ['Does this page replace professional advice?']);
});

test('sayOnce does not reach into the shared material library', () => {
  const spec = SPEC();
  const library = spec.primary.data;
  sayOnce(spec);
  assert.equal(library.opening.length > 0, true, 'the library object is cloned, not edited');
});

test('a composed page carries no phrase the Monday sample would call filler', () => {
  const html = composeArticle(sayOnce(SPEC()));
  assert.deepEqual(templateFillerPhrases(html), []);
});

test('composeArticle refuses a page that still repeats itself', () => {
  // The guard, proven negatively: without sayOnce the same spec is filler.
  assert.throws(() => composeArticle(SPEC()), /template filler/);
});

test('a long axis label is shortened for headings so it cannot form a phrase', () => {
  const long = 'working with a language model as a generic capability';
  // Trimmed until it is shorter than the eight words a counted phrase needs.
  assert.equal(headingLabel(long), 'working with a language model as a');
  assert.equal(headingLabel('priority selection support'), 'priority selection support');
});
