#!/usr/bin/env node
/**
 * Proves the weekly outcome report's rules, negatively as well as positively.
 * Search Readiness i9. Each case below was watched failing against a
 * deliberately wrong implementation before it was kept.
 */
import assert from 'node:assert/strict';
import {
  isoWeek,
  hostOf,
  redReasons,
  IMPRESSION_DROP_RED,
  MIN_BASE,
} from './build_weekly_outcome_report.mjs';

const ok = [];
function check(label, fn) {
  fn();
  ok.push(label);
}

check('isoWeek keys by ISO week, and the year follows the week not the date', () => {
  assert.equal(isoWeek(new Date('2026-10-25T00:00:00Z')), '2026-W43');
  assert.equal(isoWeek(new Date('2026-10-26T00:00:00Z')), '2026-W44');
  // 1 Jan 2027 is a Friday, so it belongs to ISO week 53 of 2026, not week 1 of 2027.
  assert.equal(isoWeek(new Date('2027-01-01T00:00:00Z')), '2026-W53');
});

check('hostOf reads sc-domain, https and bare forms', () => {
  assert.equal(hostOf('sc-domain:example.com'), 'example.com');
  assert.equal(hostOf('https://example.com/x'), 'example.com');
  assert.equal(hostOf('example.com'), 'example.com');
});

check('a healthy site with no prior week is not red', () => {
  const row = { impressions: 10, coverage_state: 'OK', errors_this_run: 0, named_stop: null };
  assert.deepEqual(redReasons(row, null), []);
});

check('a named stop is red', () => {
  const row = { impressions: 10, coverage_state: 'OK', errors_this_run: 0, named_stop: 'no GSC token' };
  const reasons = redReasons(row, null);
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /named stop/);
});

check('a coverage state other than OK is red', () => {
  const row = { impressions: 10, coverage_state: 'DEGRADED', errors_this_run: 0, named_stop: null };
  assert.match(redReasons(row, null)[0], /DEGRADED/);
});

check('collector errors are red', () => {
  const row = { impressions: 10, coverage_state: 'OK', errors_this_run: 3, named_stop: null };
  assert.match(redReasons(row, null)[0], /3 collector error/);
});

check('an impression collapse against a real base is red', () => {
  const row = { impressions: 40, coverage_state: 'OK', errors_this_run: 0, named_stop: null };
  const reasons = redReasons(row, { impressions: 400 });
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /impressions fell 90%/);
});

check('a drop at exactly the threshold is not red; past it is', () => {
  const base = { impressions: 100 };
  const atThreshold = { impressions: 100 * (1 - IMPRESSION_DROP_RED), coverage_state: 'OK', errors_this_run: 0 };
  assert.deepEqual(redReasons(atThreshold, base), [], 'exactly 50% must not trip the rule');
  const past = { impressions: 100 * (1 - IMPRESSION_DROP_RED) - 1, coverage_state: 'OK', errors_this_run: 0 };
  assert.equal(redReasons(past, base).length, 1);
});

check('single-digit noise below the base floor cannot turn a site red', () => {
  // 4 -> 1 is a 75% fall, but on a base under MIN_BASE it is noise, not a drop.
  const row = { impressions: 1, coverage_state: 'OK', errors_this_run: 0, named_stop: null };
  assert.deepEqual(redReasons(row, { impressions: MIN_BASE - 1 }), []);
  // The same fall on a base at the floor IS reported.
  assert.equal(redReasons({ ...row, impressions: 1 }, { impressions: MIN_BASE }).length, 1);
});

check('every red reason is a sentence a reader can act on, never a bare flag', () => {
  const row = { impressions: 0, coverage_state: 'DEGRADED', errors_this_run: 2, named_stop: 'quota' };
  for (const reason of redReasons(row, { impressions: 500 })) {
    assert.ok(reason.length > 12, `reason too terse to act on: ${reason}`);
    assert.ok(/[a-z]/.test(reason), `reason is not prose: ${reason}`);
  }
});

console.log(`[self-test:weekly-outcome-report] OK: ${ok.length} case(s)`);
for (const label of ok) console.log(`  - ${label}`);
