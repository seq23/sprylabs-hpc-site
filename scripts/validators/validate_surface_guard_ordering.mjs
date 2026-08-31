#!/usr/bin/env node
// A snapshot/check pair that runs back to back proves nothing.
//
// The extraction surface guard has now had this defect twice, in two different
// places, and the second time it was introduced BY the fix for the first.
//
//   Round 1. `snapshot` ran at container-prepush step 44 and `check` at step 58.
//            The snapshot step overwrote the very baseline the check step then
//            compared the tree against, so the guard graded its own answer sheet
//            and could not fail however far the surfaces had drifted.
//
//   Round 2. The fix moved BOTH steps to sit before build:all - snapshot at step
//            5, check at step 6. Adjacent. `check` now compared the tree against
//            a baseline written one step earlier, by the same job, on the same
//            runner, with nothing in between that could touch a single file. It
//            was tautological: reproduced on 2d94a44ef, where `snapshot` then
//            `check` back to back printed PASS on a tree whose surfaces differed
//            from the committed baseline in 1,489 places.
//
// Both rounds are the same defect: a comparison with no mutation between the
// baseline and the comparison. Fixing the positions again without guarding the
// property would leave round 3 available, so the property is asserted here.
//
// The rule: between a family's `snapshot` step and its `check` step there must be
// at least one step that can actually change the tree. Then a PASS means "the
// generators did not move these surfaces", which is the only claim worth making,
// and the guard has something to discover.
//
// Rule 0: this validator hard-fails when it finds zero snapshot/check families to
// examine. A profile whose pairs were renamed, retired, or restructured out of
// recognition must not be reported as protected by a loop that ran zero times.
import fs from 'node:fs';

const MATRIX_FILE = '_repo_validation_matrix.json';
const errors = [];

if (!fs.existsSync(MATRIX_FILE)) {
  console.error(`[surface-guard-ordering] FAIL: ${MATRIX_FILE} is missing, so step order cannot be checked at all.`);
  process.exit(1);
}
const matrix = JSON.parse(fs.readFileSync(MATRIX_FILE, 'utf8'));

// Kept deliberately in step with validation_shards.mjs: a step that writes the
// tree is one that builds, repairs, applies, or normalizes it. A `validate:*`
// command only ever asserts, so it can never be the mutation that makes a
// comparison meaningful - which is exactly the hole this validator closes.
const MUTATES = /\b(?:build|repair|bootstrap|apply|normalization|release|agent|intake|generate|write)\b/i;
const isMutator = (step) => {
  const command = String(step.command || '').trim();
  if (/^npm run validate:/.test(command)) return false;
  if (/^npm run validation:/.test(command)) return false;
  return MUTATES.test(String(step.id || '')) || MUTATES.test(command);
};

const ROLE = /[-:_](snapshot|check)$/i;
const familyOf = (id) => String(id).replace(ROLE, '').toLowerCase().replace(/[-:_]+/g, '-');
const roleOf = (id) => (ROLE.exec(String(id)) || [, ''])[1].toLowerCase();

let examined = 0;

for (const [profileName, profile] of Object.entries(matrix.profiles || {})) {
  const steps = profile.steps || [];
  const families = new Map();
  steps.forEach((step, index) => {
    const id = step.id || '';
    if (!ROLE.test(id)) return;
    const key = familyOf(id);
    if (!families.has(key)) families.set(key, {});
    families.get(key)[roleOf(id)] = { index, step };
  });

  for (const [family, roles] of families) {
    const { snapshot, check } = roles;
    if (!snapshot || !check) continue;
    examined += 1;

    if (check.index < snapshot.index) {
      errors.push(
        `${profileName}: ${check.step.id} (step ${check.index}) runs BEFORE ${snapshot.step.id} (step ${snapshot.index}), `
        + 'so it compares the tree against a baseline from a previous run rather than this one.'
      );
      continue;
    }

    const between = steps.slice(snapshot.index + 1, check.index);
    const mutators = between.filter(isMutator);
    if (!mutators.length) {
      errors.push(
        `${profileName}: ${snapshot.step.id} (step ${snapshot.index}) and ${check.step.id} (step ${check.index}) have `
        + `${between.length} step(s) between them and NONE of them can change the tree, so the check compares a baseline `
        + 'against the identical tree that produced it and can never fail. Move the check after the stages whose output it '
        + `is meant to police (for the ${family} family, that is build:all and the ordered repair stages).`
      );
    }
  }
}

if (!examined) {
  console.error(
    '[surface-guard-ordering] FAIL: examined 0 snapshot/check families across '
    + `${Object.keys(matrix.profiles || {}).length} profile(s). This validator exists to police the distance between a `
    + 'baseline and the comparison that reads it; finding no pairs at all means the naming changed and this guard is no '
    + 'longer reaching what it governs. It must not pass on an empty loop.'
  );
  process.exit(1);
}

if (errors.length) {
  console.error(`[surface-guard-ordering] FAIL: ${errors.length} snapshot/check pair(s) prove nothing:`);
  for (const line of errors) console.error(' -', line);
  process.exit(1);
}

console.log(`[surface-guard-ordering] PASS: ${examined} snapshot/check family(ies), each with a tree-mutating stage between the baseline and the comparison.`);
