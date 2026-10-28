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
