#!/usr/bin/env node
/**
 * "Does the page SAY this required string?" is asked by several lanes. There must
 * be ONE answer to it.
 *
 * ─── THE DEFECT ────────────────────────────────────────────────────────────
 *
 * scripts/lib/bhpc_agent_acceptance_satisfaction.mjs exists because the plan
 * builder and the trace each had their own test and DISAGREED: over 946 REQUIRED
 * entries, exact substring called 125 outstanding while token-wise called 6, and
 * the plan was carrying 119 entries the trace had already reported PASS. Its
 * header records the measurement. Both were unified onto `saysPhrase`.
 *
 * validate_page_seo_contract.mjs was a THIRD lane and was left behind, still on
 * `stripTags(html).toLowerCase().includes(heading)`. On 2026-09-12 that cost a
 * release: ai-coach-vs-human-coach.html carries the curated heading
 * "AI Coach vs Human Coach: Which Is Better?", records 2026-06-27-bhpc-106 and
 * 2026-07-04-bhpc-137 require "AI coach vs human coach which is better", and a
 * colon plus a question mark made this one lane call it MISSING_REQUIRED_HEADING -
 * eleven lines after the trace had reported PASS on the same page. Spry Content
 * Release died at release:agent-intake:raw.
 *
 * A shared module does not stop a fourth lane from writing its own test. This does.
 *
 * ─── WHAT THIS ASSERTS ─────────────────────────────────────────────────────
 *
 * Every lane that consumes `required_heading` or `required_strings` imports the
 * shared module, and none of them compares those values with a hand-rolled
 * `.includes(...)`. Rule 0: examining zero lanes is a failure, because a rename
 * must go red rather than pass over an empty set.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SHARED = 'scripts/lib/bhpc_agent_acceptance_satisfaction.mjs';

/** Anything that reads one of these fields is answering the shared question. */
const CONSUMED_FIELDS = /\brequired_heading\b|\brequired_strings\b/;

/** Where lanes live. Scanned, not listed, so a NEW lane is covered on its first run. */
const SCAN_DIRS = ['scripts/agent_intake', 'scripts/validation', 'scripts/validators', 'scripts/citation', 'scripts/release'];

/**
 * Lanes that read the fields but legitimately never test containment - they count,
 * plan or report. Each is named with its reason so the exemption stays reviewable.
 */
const NOT_A_CONTAINMENT_TEST = new Map([
  ['scripts/validation/validate_one_acceptance_satisfaction_test.mjs', 'this guard; it reads the field names as text to find the lanes'],
]);

if (!fs.existsSync(path.join(ROOT, SHARED))) {
  console.error(`[one-acceptance-test] FAIL: ${SHARED} does not exist, so there is no shared answer for any lane to use.`);
  process.exit(1);
}

const files = [];
for (const dir of SCAN_DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const name of fs.readdirSync(abs)) {
    if (name.endsWith('.mjs') || name.endsWith('.js')) files.push(path.posix.join(dir, name));
  }
}

const errors = [];
let lanesExamined = 0;

for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!CONSUMED_FIELDS.test(src)) continue;
  if (NOT_A_CONTAINMENT_TEST.has(rel)) continue;

  // A hand-rolled containment test against the required value, in any of the
  // shapes this repo has actually produced.
  const handRolled = [
    /\.toLowerCase\(\)\s*\.includes\(\s*\w*[Hh]eading/,
    /\.includes\(\s*\w*[Hh]eading\w*\.toLowerCase\(\)/,
    /\.includes\(\s*required\w*\s*\)/,
    /\.indexOf\(\s*\w*[Hh]eading/,
  ].filter((re) => re.test(src));

  const importsShared = /bhpc_agent_acceptance_satisfaction\.mjs/.test(src);
  if (!handRolled.length && !importsShared) continue;   // reads the field, tests nothing

  lanesExamined += 1;
  if (handRolled.length) {
    errors.push(
      `${rel}: compares a required value with its own containment test (${handRolled.map((re) => re.source).join(', ')}). `
      + `Use saysPhrase from ${SHARED} - a second answer to this question is how a page that plainly says the phrase gets called missing.`);
  }
  if (!importsShared) {
    errors.push(`${rel}: consumes required_heading/required_strings and does not import ${SHARED}.`);
  }
}

// Rule 0.
if (lanesExamined === 0) {
  errors.push(
    `zero_lanes_examined: no file under ${SCAN_DIRS.join(', ')} was found testing a required heading or string. `
    + 'Either the fields were renamed or the lanes moved; this check proved nothing.');
}

if (errors.length) {
  console.error(`[one-acceptance-test] FAIL: ${errors.length} problem(s)`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

console.log(`[one-acceptance-test] PASS: ${lanesExamined} lane(s) testing acceptance satisfaction, all on ${SHARED}.`);
