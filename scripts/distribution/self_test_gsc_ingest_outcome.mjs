#!/usr/bin/env node
/**
 * Prove the Search Console ingest failure is surfaced rather than swallowed.
 *
 * The defect was one operator: `npm run queries:ingest || true` in the deploy.
 * The negative test below reproduces it directly - it runs a command that exits
 * non-zero under `|| true` and shows the shell reporting success, then runs the
 * same failing command through the outcome recorder and shows the run failing.
 * The two shell verdicts side by side are the evidence.
 *
 * It also asserts the workflow itself no longer contains the swallow, so the
 * operator cannot quietly come back.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

const ROOT = process.cwd();
const DIR = path.join(ROOT, '.build/self-test/step-outcome');
const RECORD = 'scripts/distribution/record_step_outcome.mjs';
const ASSERT = 'scripts/distribution/assert_step_outcome.mjs';
const WORKFLOW = '.github/workflows/deploy-distribution.yml';
const errors = [];

fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

const sh = (cmd) => { try { execSync(cmd, { cwd: ROOT, stdio: 'pipe' }); return 0; } catch (e) { return e.status; } };
const node = (args) => { try { execFileSync(process.execPath, args, { cwd: ROOT, stdio: 'pipe' }); return 0; } catch (e) { return e.status; } };

// The old behaviour, reproduced: a failing ingest reports success.
const swallowedExit = sh('bash -c \'(exit 7) || true\'');
if (swallowedExit !== 0) errors.push('fixture error: `|| true` should have reported success');

// The new behaviour: the same failure is recorded and then surfaced.
const failedOutcome = path.join(DIR, 'failed.json');
node([RECORD, failedOutcome, 'queries:ingest', 'failed', '7', 'ingest exited non-zero']);
const surfacedExit = node([ASSERT, failedOutcome]);
if (surfacedExit === 0) errors.push('a recorded failure did not fail the run; the swallow is still effectively in place');

// A named credential skip must stay green - an unconfigured secret is not a defect.
const skipOutcome = path.join(DIR, 'skipped.json');
node([RECORD, skipOutcome, 'queries:ingest', 'skipped_no_credential', '0', 'GSC_SERVICE_ACCOUNT_JSON is not configured']);
if (node([ASSERT, skipOutcome]) !== 0) errors.push('a named credential skip failed the run; a missing secret is a legitimate condition');
const skipRec = JSON.parse(fs.readFileSync(skipOutcome, 'utf8'));
if (skipRec.succeeded !== false || skipRec.is_failure !== false) errors.push('a skip must not be recorded as a success');

// A clean run stays green and is recorded as such.
const ranOutcome = path.join(DIR, 'ran.json');
node([RECORD, ranOutcome, 'queries:ingest', 'ran', '0']);
if (node([ASSERT, ranOutcome]) !== 0) errors.push('a clean run failed the assertion');
if (JSON.parse(fs.readFileSync(ranOutcome, 'utf8')).succeeded !== true) errors.push('a clean run was not recorded as succeeded');

// Silence is a failure: no record means the recording step never ran.
if (node([ASSERT, path.join(DIR, 'absent.json')]) === 0) errors.push('a missing outcome record passed; that is the same silence in a different costume');

// An unknown outcome name must be rejected rather than invented.
if (node([RECORD, path.join(DIR, 'bogus.json'), 'queries:ingest', 'probably_fine', '0']) === 0) errors.push('an unnamed outcome was accepted');

// The workflow must not carry the swallow, and must assert the outcome.
const wf = fs.readFileSync(path.join(ROOT, WORKFLOW), 'utf8');
if (/npm run queries:ingest\s*\|\|\s*true/.test(wf)) errors.push(`${WORKFLOW}: \`npm run queries:ingest || true\` is back`);
if (!wf.includes('scripts/distribution/record_step_outcome.mjs')) errors.push(`${WORKFLOW}: no step outcome is recorded for the ingest`);
if (!wf.includes('scripts/distribution/assert_step_outcome.mjs')) errors.push(`${WORKFLOW}: the recorded outcome is never asserted, so a failure still cannot fail the run`);
if (!wf.includes('scripts/distribution/persist_inspection_results.mjs')) errors.push(`${WORKFLOW}: URL inspection verdicts are still discarded`);
if (!wf.includes('gsc-measurement-evidence-')) errors.push(`${WORKFLOW}: the measurement evidence is never uploaded`);
// The deploy lane is read-only by contract; evidence is published, not committed.
if (!/permissions:\s*\n\s{2}contents:\s*read\s*\n\s{2}actions:\s*read/m.test(wf)) errors.push(`${WORKFLOW}: deploy permissions changed; this lane must stay read-only`);

const report = {
  schema_version: '1.0',
  status: errors.length ? 'FAIL' : 'PASS',
  old_swallow_exit_status: swallowedExit,
  new_surfaced_exit_status: surfacedExit,
  errors,
};
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/gsc-ingest-outcome-self-test.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
