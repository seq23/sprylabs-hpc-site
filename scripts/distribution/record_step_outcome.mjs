#!/usr/bin/env node
/**
 * Write a named outcome record for one workflow step.
 *
 * The deploy ran `npm run queries:ingest || true`. That is the only script that
 * produces real Search Console numbers, and `|| true` threw away its exit status,
 * so a crash, a clean run, and a run that never happened were all indistinguishable
 * from outside the job. An outcome that is not written down is not an outcome.
 *
 * Three outcomes, deliberately distinct:
 *   ran                     - the command executed and exited 0.
 *   skipped_no_credential   - a required secret is absent. Legitimate; not a failure.
 *   failed                  - the command executed and exited non-zero. Surfaced.
 *
 * Usage: record_step_outcome.mjs <out.json> <step> <outcome> <exit-code> [reason] [log-file]
 */
import fs from 'node:fs';
import path from 'node:path';

const OUTCOMES = new Set(['ran', 'skipped_no_credential', 'failed']);
const LOG_TAIL_BYTES = 4000;

const [out, step, outcome, exitCode, reason = '', logFile = ''] = process.argv.slice(2);
if (!out || !step || !outcome || exitCode === undefined) {
  console.error('usage: record_step_outcome.mjs <out.json> <step> <outcome> <exit-code> [reason] [log-file]');
  process.exit(2);
}
if (!OUTCOMES.has(outcome)) {
  console.error(`record_step_outcome: unknown outcome "${outcome}"; expected one of ${[...OUTCOMES].join(', ')}`);
  process.exit(2);
}

let logTail = null;
if (logFile && fs.existsSync(logFile)) {
  const buf = fs.readFileSync(logFile);
  logTail = buf.subarray(Math.max(0, buf.length - LOG_TAIL_BYTES)).toString('utf8');
}

const record = {
  schema_version: '1.0',
  step,
  outcome,
  exit_code: Number(exitCode),
  succeeded: outcome === 'ran',
  is_failure: outcome === 'failed',
  reason: reason || null,
  recorded_at: new Date().toISOString(),
  log_tail: logTail,
};
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, JSON.stringify(record, null, 2) + '\n');
console.log(`[step-outcome] ${step}: ${outcome} (exit ${record.exit_code})${reason ? ` - ${reason}` : ''}`);
