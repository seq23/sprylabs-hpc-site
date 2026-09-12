#!/usr/bin/env node
/**
 * The lane that ABSORBS an agent run must also PIN its raw evidence.
 *
 * ─── THE DEFECT ────────────────────────────────────────────────────────────
 *
 * validate:ownership refuses raw agent evidence that is not pinned in
 * `immutable_evidence` - "raw evidence that nothing pins can be rewritten with no
 * trace" - and checks COMPLETENESS against the tree, so a run that arrives unpinned
 * is an error rather than a silence. That is the correct design.
 *
 * `protected-baseline:rebaseline` is the tool that pins it, and NOTHING INVOKED IT.
 * Its own header records why the pins were missing for nine of thirteen runs: adding
 * a run meant typing four more sha256 lines by hand, so nobody did. Making the tool
 * did not fix that, because the tool was still something a person had to remember.
 *
 * So every weekly artifact arrives unpinned and takes Daily Citation Intelligence
 * red. On 2026-09-12, run 34697045072:
 *
 *   UNPROTECTED_RAW_EVIDENCE: data/report_fixes/agent_runs/2026-09-12/bhpc/bhpc.csv
 *   UNPROTECTED_RAW_EVIDENCE: .../bhpc.html
 *   UNPROTECTED_RAW_EVIDENCE: .../bhpc.json
 *   UNPROTECTED_AGENT_DECLARATION: .../agent_run_manifest.json
 *
 * `agent:bhpc:absorb` now runs the pin. It is SAFE to run automatically and this is
 * the property that makes the wiring legitimate rather than a rubber stamp: the tool
 * is APPEND-ONLY for raw evidence. It adds a newly arrived artifact and REFUSES to
 * rewrite a pin whose bytes changed - a raw byte change is a defect, and the fix for
 * a defect is never "re-pin it". Re-pinning still needs --allow-raw-repin with a
 * stated reason, by hand, visible in the diff.
 *
 * ─── WHAT THIS ASSERTS ─────────────────────────────────────────────────────
 *
 * The absorber runs the pin, the pin is still append-only, and the re-pin escape
 * hatch has not been wired into any automatic lane. Rule 0: if the absorber script
 * cannot be found, that is a failure, not a pass.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts || {};
const ABSORB = 'agent:bhpc:absorb';
const PIN = 'protected-baseline:rebaseline';
const PIN_TOOL = 'scripts/validation/rebaseline_protected_evidence.mjs';

const errors = [];

if (!scripts[ABSORB]) {
  errors.push(`absorber_missing: npm script \`${ABSORB}\` does not exist, so this check cannot reach the lane it governs.`);
} else if (!scripts[ABSORB].includes(PIN)) {
  errors.push(
    `pin_not_wired: \`${ABSORB}\` does not run \`${PIN}\`. Raw evidence for a newly absorbed run then sits unpinned, `
    + 'and validate:ownership refuses it by design - which is how every weekly artifact took Daily Citation Intelligence red.');
}

if (!scripts[PIN]) {
  errors.push(`pin_missing: npm script \`${PIN}\` does not exist, so nothing can pin newly arrived evidence.`);
} else if (!fs.existsSync(path.join(ROOT, PIN_TOOL))) {
  errors.push(`pin_tool_missing: ${PIN_TOOL} does not exist.`);
} else {
  const src = fs.readFileSync(path.join(ROOT, PIN_TOOL), 'utf8');
  // The append-only refusal is what makes automatic invocation safe. If it goes, the
  // wiring above turns into a machine that re-pins tampered evidence on a schedule.
  if (!/allow-raw-repin/.test(src)) {
    errors.push(
      `pin_no_longer_append_only: ${PIN_TOOL} no longer gates re-pinning behind --allow-raw-repin. `
      + `Running it automatically from \`${ABSORB}\` is only safe while a CHANGED raw pin is refused.`);
  }
}

// The escape hatch must never be automatic.
for (const [name, cmd] of Object.entries(scripts)) {
  if (typeof cmd === 'string' && cmd.includes('--allow-raw-repin')) {
    errors.push(`repin_wired_into_a_lane: npm script \`${name}\` passes --allow-raw-repin. Accepting a changed raw hash is a human decision with a stated reason, never a step.`);
  }
}

if (errors.length) {
  console.error(`[new-evidence-pinned] FAIL: ${errors.length} problem(s)`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

console.log(`[new-evidence-pinned] PASS: \`${ABSORB}\` runs \`${PIN}\`, the pin is still append-only, and no lane passes --allow-raw-repin.`);
