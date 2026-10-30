import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const B = require('../scripts/lib/search_snippet_bounds.cjs');
const host = 'billionairehighperformancecoach.com';

for (const title of [
  'How can I turn AI into a structure to stay accountable without…',
  'Wellness reset with MVD Case Study',
  'A-player mode for a creative who is working without a chief…',
  'A-player mode for a founder | BHPC',
  'How can I turn AI into a structure to stay accountable without shame? | Billionaire High Performance Coach',
]) {
  test(`snippet retains its own brand: ${title}`, () => {
    const candidates = B.titleCandidates(title, host);
    assert.ok(candidates.length);
    for (const candidate of candidates) {
      assert.ok(B.inTitleRange(candidate), candidate);
      assert.ok(B.titleNamesHost(candidate, host), candidate);
      assert.equal(B.titleNamesSibling(candidate, host), false, candidate);
    }
  });
}

test('a valid existing branded title stays stable', () => {
  const title = 'System drift for a founder protecting a strategic project | BHPC';
  assert.equal(B.titleCandidates(title, host)[0], title);
});

test('use the short name before cutting away the question', () => {
  assert.equal(B.titleCandidates('Wellness reset with MVD Case Study', host)[0], 'Wellness reset with MVD Case Study | BHPC');
});

test('a sibling topic on Spry uses the abbreviation and retains Spry branding', () => {
  const candidates = B.titleCandidates('Billionaire high performance coach vs therapy | Spry Executive OS', 'spryexecutiveos.com');
  assert.ok(candidates.length);
  assert.match(candidates[0], /^BHPC vs therapy/);
  assert.ok(B.titleNamesHost(candidates[0], 'spryexecutiveos.com'));
});

// 30 Oct 2026: build_navigation_structure.mjs passed hostFor()'s origin URL,
// BRANDS[url] was undefined, and short hub titles were written as "undefined".
test('an origin URL and its bare host get the same branded titles', () => {
  for (const h of ['spryexecutiveos.com', 'billionairehighperformancecoach.com']) {
    for (const t of ['Guides index', 'Money and wealth | Insights', 'Agent notes index']) {
      const bare = B.titleCandidates(t, h);
      assert.ok(bare.length, `${t} on ${h}`);
      assert.deepEqual(B.titleCandidates(t, `https://${h}`), bare);
      assert.deepEqual(B.titleCandidates(t, `https://${h}/guides/`), bare);
    }
  }
});

test('brandedTitle never returns undefined: it brands or throws', () => {
  assert.equal(B.brandedTitle('Guides index', 'https://spryexecutiveos.com'), 'Guides index | Spry Executive OS');
  assert.throws(() => B.brandedTitle('Guides index', 'https://unknown.example'), /no brand declared/);
  assert.throws(() => B.brandedTitle('', 'spryexecutiveos.com'), /no title/);
});

// The demand-family applier writes brandedTitle(), and the snippet repair's
// first candidate for that title is the title itself, so the two agree.
test('a branded demand title is stable under the snippet repair', () => {
  for (const [t, h] of [
    ['AI Executive Coaching: What an AI Executive Coach Does', 'billionairehighperformancecoach.com'],
    ['Executive OS: What an Executive Operating System Is', 'spryexecutiveos.com'],
  ]) {
    const branded = B.brandedTitle(t, h);
    assert.notEqual(branded, t);
    assert.equal(B.titleCandidates(branded, h)[0], branded);
  }
});
