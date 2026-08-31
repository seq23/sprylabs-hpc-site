#!/usr/bin/env node
/**
 * Guards the stop-grading decision in the workflow orchestration and the
 * self-heal loop, in BOTH directions:
 *
 *   - a legitimate named stop must be GREEN and self-explaining, and
 *   - a stage that exits 0 having done nothing must be RED.
 *
 * Two CONFIRMED defects this exists to keep fixed:
 *
 *   1. scripts/selfheal/heal_until_clean.mjs printed `self-heal: attempt 0 - 0
 *      failing step(s)` / `CLEAN` and exited 0 when validate:profile had crashed
 *      with INTERNAL_ERROR and written no receipt. Reproduced by invoking it
 *      against an unknown profile.
 *   2. scripts/workflow/hostile_review.mjs printed `PASS all governed
 *      workflows=3` and exited 0 with reviewed_count=0, every lane skipped for a
 *      missing trace. Reproduced by moving the two tracked latest.json aside.
 *
 * The check is behavioural, not prose: it drives the real grading functions with
 * paired fixtures (each legitimate stop proved green AND its silent-zero twin
 * proved red), it proves the two consumers actually route their exit code
 * through those functions rather than keeping a second copy of the decision, and
 * it executes the real self-heal binary end-to-end against a crashed profile.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {gradeSelfHealOutcome, gradeHostileAggregate, stopGradingSelfTest} from './stop_grading.mjs';

const ROOT = process.cwd();
const errors = [];
let checks = 0;

const check = (name, fn) => {
  checks += 1;
  try {
    const failure = fn();
    if (failure) errors.push(`${name}: ${failure}`);
  } catch (error) {
    errors.push(`${name}: threw ${error.message}`);
  }
};

// ---------------------------------------------------------------------------
// 1. The paired fixtures inside the grader itself.
// ---------------------------------------------------------------------------
const selfTest = stopGradingSelfTest();
if (selfTest.fixtures === 0) {
  console.error('[validate:stop-grading-parity] FAIL: the grader self-test declares zero fixtures. A guard that examines nothing must not pass.');
  process.exit(1);
}
check('grader fixtures', () => (selfTest.failures.length ? selfTest.failures.join(' | ') : null));

// Both directions must actually be represented, or this could be satisfied by a
// fixture set that only ever asserts "red".
check('fixtures cover both directions', () => {
  const green = gradeHostileAggregate({results: [{workflow_id: 'a', status: 'PASS'}, {workflow_id: 'b', status: 'SKIP'}]});
  const red = gradeHostileAggregate({results: [{workflow_id: 'b', status: 'SKIP'}]});
  if (green.exitCode !== 0) return 'a partial skip must be green';
  if (!green.stop?.code || !green.stop?.message) return 'a green stop must be named AND carry a human-readable message';
  if (red.exitCode === 0) return 'an all-skipped review must be red';
  return null;
});

// ---------------------------------------------------------------------------
// 2. The consumers must route their exit code through the shared grader.
//    "Exists but nothing invokes it" is the defect class being excluded here.
// ---------------------------------------------------------------------------
const CONSUMERS = [
  {file: 'scripts/selfheal/heal_until_clean.mjs', fn: 'gradeSelfHealOutcome', exit: 'process.exit(grade.exitCode);'},
  {file: 'scripts/workflow/hostile_review.mjs', fn: 'gradeHostileAggregate', exit: 'if (grade.exitCode !== 0) {'},
];
for (const consumer of CONSUMERS) {
  check(`${consumer.file} is wired to the shared grader`, () => {
    const abs = path.join(ROOT, consumer.file);
    if (!fs.existsSync(abs)) return 'consumer file is missing';
    const source = fs.readFileSync(abs, 'utf8');
    if (!/from '.*stop_grading\.mjs'/.test(source)) return 'does not import scripts/workflow/stop_grading.mjs';
    if (!source.includes(`${consumer.fn}(`)) return `imports the module but never calls ${consumer.fn}()`;
    if (!source.includes(consumer.exit)) return 'does not route its exit code through the grader result; a second copy of the decision would drift from this one';
    return null;
  });
}

// The old bug in one line: the loop coerced "no receipt" into "no failures".
check('self-heal no longer coerces a missing receipt into an empty failure list', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/selfheal/heal_until_clean.mjs'), 'utf8');
  if (/readFailures\(\)\s*\?\?\s*\[\]/.test(source)) return 'the `readFailures() ?? []` coercion is back; a crashed profile grades as CLEAN again';
  if (/process\.exit\(failed\.length \? 1 : 0\)/.test(source)) return 'the exit code is derived from failed.length again, which cannot tell "no failures" from "nothing graded"';
  return null;
});

// ---------------------------------------------------------------------------
// 3. End-to-end: the real binary, against a profile that writes no receipt.
//    This is the exact reproduction of defect 1.
// ---------------------------------------------------------------------------
check('self-heal binary exits non-zero on a profile that wrote no receipt', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-grading-'));
  const report = path.join(tmp, 'self-heal-loop.json');
  const profile = `stop-grading-parity-nonexistent-${process.pid}`;
  const result = spawnSync(process.execPath, [
    'scripts/selfheal/heal_until_clean.mjs', `--profile=${profile}`, '--max=0', `--report=${report}`,
  ], {cwd: ROOT, encoding: 'utf8'});
  const combined = `${result.stdout || ''}${result.stderr || ''}`;
  try {
    if (result.status === 0) return `exited 0 for a profile that produced no receipt. Rule 0: no stage may exit 0 having done nothing. Output was: ${combined.trim().split('\n').slice(-3).join(' / ')}`;
    if (!fs.existsSync(report)) return 'wrote no report at the requested path';
    const doc = JSON.parse(fs.readFileSync(report, 'utf8'));
    if (doc.status === 'CLEAN') return 'reported status CLEAN having graded nothing';
    if (doc.stop_reason?.code !== 'PROFILE_RECEIPT_MISSING') return `expected stop_reason PROFILE_RECEIPT_MISSING, got ${doc.stop_reason?.code ?? 'none'}`;
    if (!String(doc.stop_reason?.message || '').trim()) return 'the stop is not self-explaining: no message a human can read';
    return null;
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
});

// A real receipt, really on disk, must still grade CLEAN - the fix must not turn
// working lanes red. Uses a tracked receipt so this cannot silently examine
// nothing.
check('a real tracked profile receipt still grades CLEAN when its steps passed', () => {
  const rel = 'artifacts/validation/profile-container-prepush.json';
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return `${rel} is missing; this check cannot examine a real receipt and must not pass on an empty loop`;
  const receipt = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const steps = Array.isArray(receipt.steps) ? receipt.steps : [];
  if (!steps.length) return `${rel} lists zero steps; there is no real receipt to grade against`;
  const passingOnly = {steps: steps.map(step => ({...step, exit_code: 0}))};
  const grade = gradeSelfHealOutcome({profileExit: 0, receipt: passingOnly, profile: 'container-prepush'});
  if (grade.exitCode !== 0 || grade.status !== 'CLEAN') return `a receipt of ${steps.length} passing step(s) graded ${grade.status}/${grade.exitCode}; the fix has turned a working lane red`;
  return null;
});

// ---------------------------------------------------------------------------
// Rule 0 applies to this validator too.
// ---------------------------------------------------------------------------
if (checks === 0) {
  console.error('[validate:stop-grading-parity] FAIL: examined zero items. A validator that inspects nothing must not pass.');
  process.exit(1);
}

const report = {
  schema_version: '1.0',
  validator: 'stop-grading-parity',
  status: errors.length ? 'FAIL' : 'PASS',
  checks_run: checks,
  grader_fixtures: selfTest.fixtures,
  consumers: CONSUMERS.map(c => c.file),
  errors,
  generated_at: new Date().toISOString(),
};
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), {recursive: true});
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/stop-grading-parity.json'), `${JSON.stringify(report, null, 2)}\n`);

if (errors.length) {
  console.error(`[validate:stop-grading-parity] FAIL: ${errors.length} defect(s) across ${checks} check(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`[validate:stop-grading-parity] PASS: ${checks} check(s), ${selfTest.fixtures} grader fixture(s); every no-work zero is red and every legitimate stop is named.`);
