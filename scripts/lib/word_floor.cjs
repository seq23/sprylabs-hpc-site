'use strict';
// The one word-count rule every validator and generator in this repo applies
// (owner ruling 2 Nov 2026, config/word_count_policy.json):
//   - going OVER a word limit never fails; it is information at most;
//   - going UNDER a floor fails only below (1 - cushion) of it. With the 25%
//     cushion a 300-word floor fails under 225; 225..299 is a warning.
// The Python twin is scripts/lib/word_floor.py; both read the same JSON.
const path = require('path');
const fs = require('fs');

const POLICY_PATH = path.join(__dirname, '..', '..', 'config', 'word_count_policy.json');
const POLICY = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
const UNDER_FLOOR_CUSHION = Number(POLICY.under_floor_cushion);
if (!(UNDER_FLOOR_CUSHION >= 0 && UNDER_FLOOR_CUSHION < 1)) {
  throw new Error(`[word-floor] ${POLICY_PATH}: under_floor_cushion must be in [0, 1), got ${POLICY.under_floor_cushion}`);
}

/** The count below which a page under `floor` fails (75% of the floor). */
function hardFloor(floor) {
  return Number(floor) * (1 - UNDER_FLOOR_CUSHION);
}

/** 'pass' at or above the floor, 'cushion' (warn) within it, 'fail' below the hard floor. */
function floorVerdict(words, floor) {
  const f = Number(floor) || 0;
  if (f <= 0 || words >= f) return 'pass';
  return words >= hardFloor(f) ? 'cushion' : 'fail';
}

/** Over a word limit is 'over' (info only), never a failure. */
function limitVerdict(words, max) {
  const m = Number(max) || 0;
  return m > 0 && words > m ? 'over' : 'pass';
}

module.exports = { UNDER_FLOOR_CUSHION, POLICY_PATH, hardFloor, floorVerdict, limitVerdict };
