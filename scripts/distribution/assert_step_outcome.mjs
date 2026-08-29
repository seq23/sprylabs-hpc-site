#!/usr/bin/env node
/**
 * Turn a recorded step outcome into the run's verdict.
 *
 * `|| true` did not just hide the ingest's failures from the log; it hid them
 * from the run's conclusion, so the deploy went green over a Search Console
 * ingestion that never produced a number. This is the step that makes a crash
 * visible where people actually look - the red run - while leaving a named,
 * credential-less skip green, because a fork or an unconfigured secret is not a
 * defect.
 *
 * A missing outcome file is itself a failure: it means the recording step did not
 * run, which is the same silence in a different costume.
 *
 * Usage: assert_step_outcome.mjs <outcome.json>
 */
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: assert_step_outcome.mjs <outcome.json>');
  process.exit(2);
}
if (!fs.existsSync(file)) {
  console.error(`[step-outcome] no outcome recorded at ${file}; the step that should have written it did not run`);
  process.exit(1);
}

const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log(`[step-outcome] ${rec.step}: ${rec.outcome} (exit ${rec.exit_code})${rec.reason ? ` - ${rec.reason}` : ''}`);
if (rec.outcome === 'failed') {
  if (rec.log_tail) console.error(rec.log_tail);
  console.error(`[step-outcome] ${rec.step} failed with exit ${rec.exit_code}. This used to be swallowed by \`|| true\`.`);
  process.exit(1);
}
if (rec.outcome === 'skipped_no_credential') {
  console.log(`[step-outcome] ${rec.step} was skipped for a missing credential; that is a named skip, not a pass.`);
}
