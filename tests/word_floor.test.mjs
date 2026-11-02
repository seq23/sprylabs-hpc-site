// The word-count rule (owner ruling 2 Nov 2026, config/word_count_policy.json):
// over a word limit never fails; under a floor fails only below 75% of it.
// Proves the JS helper and its Python twin give the same verdicts.
// Run: node --test tests/word_floor.test.mjs (wired into validate:content).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { ensureRuntime, managedPython } from '../scripts/validation/python_runtime.mjs';

const require = createRequire(import.meta.url);
const { floorVerdict, limitVerdict, hardFloor } = require('../scripts/lib/word_floor.cjs');

// [words, floor, expected]: 300 floor -> 225 hard floor.
const FLOOR_CASES = [
  [300, 300, 'pass'],
  [5000, 300, 'pass'],        // far over: never a failure
  [228, 300, 'cushion'],      // 76% of the floor: passes (warn only)
  [225, 300, 'cushion'],      // exactly 75%: passes
  [224, 300, 'fail'],         // just under 75%
  [222, 300, 'fail'],         // 74% of the floor: fails
  [0, 0, 'pass'],             // no floor declared
];

test('over a word limit is info, never a failure', () => {
  assert.equal(limitVerdict(651, 650), 'over');
  assert.equal(limitVerdict(5000, 650), 'over');
  assert.equal(limitVerdict(650, 650), 'pass');
  assert.equal(floorVerdict(5000, 300), 'pass');
});

test('under a floor fails only below 75% of it (JS)', () => {
  assert.equal(hardFloor(300), 225);
  for (const [w, f, want] of FLOOR_CASES) assert.equal(floorVerdict(w, f), want, `${w} words vs ${f} floor`);
  // 76% passes and 74% fails at other floors too, not just 300.
  for (const f of [120, 600, 1200]) {
    assert.notEqual(floorVerdict(Math.ceil(f * 0.76), f), 'fail', `76% of ${f}`);
    assert.equal(floorVerdict(Math.floor(f * 0.74), f), 'fail', `74% of ${f}`);
  }
});

test('the Python twin reads the same policy and agrees', () => {
  ensureRuntime();
  const code = [
    'import sys, json; sys.path.insert(0, "scripts/lib")',
    'from word_floor import floor_verdict, limit_verdict',
    `cases = ${JSON.stringify(FLOOR_CASES)}`,
    'print(json.dumps([floor_verdict(w, f) for w, f, _ in cases] + [limit_verdict(5000, 650)]))',
  ].join('\n');
  const out = JSON.parse(execFileSync(managedPython(), ['-c', code], { encoding: 'utf8' }).trim().split('\n').pop());
  assert.deepEqual(out, [...FLOOR_CASES.map((c) => c[2]), 'over']);
});
