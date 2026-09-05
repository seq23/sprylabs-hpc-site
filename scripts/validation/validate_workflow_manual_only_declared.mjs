#!/usr/bin/env node
/**
 * VAL-WORKFLOW-MANUAL-ONLY-DECLARED
 *
 * THE QUESTION THIS ANSWERS. `Admin Operations` has never run on main. Asked
 * whether that is deliberate or whether the lane had silently died, nothing in
 * the repository could answer, and the answer is not derivable from the run
 * history: "never ran" looks identical for a workflow nobody needed to dispatch
 * and a workflow everyone forgot.
 *
 * WHAT WAS ALREADY COVERED, AND IS NOT DUPLICATED HERE. Before writing this I
 * checked, and validate:workflow-contract already resolves every `npm run`,
 * every `node` entrypoint and every local helper a workflow references against
 * package.json and the disk (its lines 198-205). Re-asserting that here would
 * create a second list with no link to the first, which is the defect class this
 * repository keeps getting bitten by. That arm is left where it lives, and this
 * guard cites it rather than copying it.
 *
 * WHAT IS ACTUALLY NEW.
 *
 *   D. A dispatch `choice` input must decide something. Every option must reach
 *      a step gated on it, a shell case arm naming it, or a script the input is
 *      passed to. An input read by nothing is a dropdown wired to nothing, where
 *      every option runs identical steps and the job exits 0 having done nothing
 *      the operator asked for (Rule 0). faux_trace_all_workflows.py builds one
 *      trace per option but never asserts the option reaches anything, and it
 *      keeps its own hardcoded copy of the option list.
 *
 *   E. THE RECORDED ANSWER. A workflow with no automatic trigger (no schedule,
 *      no push, no workflow_run, no pull_request, no repository_dispatch) must be
 *      declared in data/workflows/manual_only_workflows.json with a stated
 *      reason, AND every workflow declared there must actually still have no
 *      automatic trigger. Both directions, because a declaration nothing checks
 *      is a comment, and a check with no declaration turns "this has never run"
 *      back into an open question every future sweep has to re-litigate.
 *
 * This asserts behaviour and structure, not prose. Arm E does require a reason
 * string to be non-empty, which is the one textual thing here - but the load is
 * carried by the bidirectional trigger reconciliation around it, and a stale
 * declaration fails on the trigger, not on the wording.
 *
 * Rule 0: hard-fails if it walks zero workflows, reconciles zero manual-only
 * workflows, or examines zero dispatch options. Prove it by pointing
 * WORKFLOW_DIR at an empty directory.
 */import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WORKFLOW_DIR = process.env.WORKFLOW_DIR || '.github/workflows';
const DECL_PATH = process.env.MANUAL_ONLY_DECL || 'data/workflows/manual_only_workflows.json';
const OUT = process.env.WORKFLOW_MANUAL_ONLY_OUT || 'artifacts/validation/workflow-manual-only-declared.json';

const AUTO_TRIGGERS = ['schedule', 'push', 'pull_request', 'workflow_run', 'repository_dispatch'];

const errors = [];
const notes = [];

// ------------------------------------------------------------------ inputs

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
} catch (e) {
  console.error(`[workflow-manual-only-declared] FAIL: package.json unreadable (${e.message}); every arm below resolves commands against it, so none of them could run.`);
  process.exit(1);
}
const scripts = pkg.scripts || {};
if (Object.keys(scripts).length === 0) {
  console.error('[workflow-manual-only-declared] FAIL: package.json declares zero scripts, so "does this npm run resolve" cannot be answered. Examining nothing is not passing (Rule 0).');
  process.exit(1);
}

const dir = path.join(ROOT, WORKFLOW_DIR);
let files = [];
try {
  files = fs.readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort();
} catch (e) {
  console.error(`[workflow-manual-only-declared] FAIL: cannot read ${WORKFLOW_DIR} (${e.message}). A reachability guard that cannot find the workflows has proved nothing (Rule 0).`);
  process.exit(1);
}
if (files.length === 0) {
  console.error(`[workflow-manual-only-declared] FAIL: ${WORKFLOW_DIR} contains no workflow files, so this guard examined zero workflows. A validator that passes while examining zero items is not passing (Rule 0).`);
  process.exit(1);
}

let decl = null;
try {
  decl = JSON.parse(fs.readFileSync(path.join(ROOT, DECL_PATH), 'utf8'));
} catch (e) {
  console.error(`[workflow-manual-only-declared] FAIL: cannot read ${DECL_PATH} (${e.message}). Without it, "this workflow has never run - is it dead?" has no recorded answer and arm E would silently pass.`);
  process.exit(1);
}
const declared = decl.workflows && typeof decl.workflows === 'object' ? decl.workflows : {};

// ------------------------------------------------------------- per workflow

let optionsChecked = 0;
const manualOnly = [];
const perWorkflow = {};

for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const wf = { options: [], jobs: 0, steps: 0, auto_triggers: [] };

  // -- C. structure. Indentation-based, because there is no YAML parser here;
  // it is deliberately conservative and only claims "at least one".
  const jobsIdx = text.search(/^jobs:\s*$/m);
  if (jobsIdx < 0) {
    errors.push(`${file}: declares no jobs: block. A workflow with no jobs produces a zero-job run, which the run logs never explain.`);
  } else {
    const jobsBody = text.slice(jobsIdx);
    wf.jobs = (jobsBody.match(/^ {2}[A-Za-z_][\w-]*:\s*$/gm) || []).length;
    wf.steps = (jobsBody.match(/^\s+- (name|uses|run):/gm) || []).length;
    if (wf.jobs === 0) errors.push(`${file}: jobs: block declares no job.`);
    if (wf.steps === 0) errors.push(`${file}: declares ${wf.jobs} job(s) but no steps, so a dispatch would exit 0 having done nothing.`);
  }

  // -- triggers. The `on:` block runs from its own line to the next top-level
  // key; slicing to the first line that starts in column 0 after it is what
  // keeps `push:` inside a job step from reading as a trigger.
  const onIdx = text.search(/^on:\s*$/m);
  let onBody = '';
  if (onIdx >= 0) {
    const after = text.slice(onIdx + text.slice(onIdx).indexOf('\n') + 1);
    const nextTop = after.search(/^[A-Za-z_]/m);
    onBody = nextTop >= 0 ? after.slice(0, nextTop) : after;
  }
  for (const t of AUTO_TRIGGERS) {
    if (new RegExp(`^\\s{2}${t}:`, 'm').test(onBody)) wf.auto_triggers.push(t);
  }

  // Arms A and B (npm scripts resolve, entrypoints exist) deliberately live in
  // validate:workflow-contract and are NOT repeated here. See the header.

  // -- D. every dispatch choice option reaches something.
  //
  // Two legitimate shapes, and the check must not mistake one for the other:
  //
  //   gated    - a step carries `if: inputs.X == 'opt'`, or a shell case arm
  //              names it. Admin Operations is this shape.
  //   passed   - the input is handed to a script as `${{ inputs.X }}` and the
  //              script dispatches on it. Admin Command is this shape, and its
  //              option list is reconciled against data/admin/command_registry.json
  //              by VAL-ADMIN-COMMAND-VERIFY-LANE.
  //
  // What is NOT legitimate is an input that is declared and then never read at
  // all: a dropdown wired to nothing, where every option exits 0 having done
  // nothing. That is the case this arm exists to catch.
  for (const block of text.matchAll(/^ {6}([A-Za-z_][\w-]*):\s*\n(?:[^\n]*\n)*?\s+type:\s*choice\s*\n(?:[^\n]*\n)*?\s+options:\s*\n((?:\s+-\s+\S+\n)+)/gm)) {
    const inputName = block[1];
    const opts = block[2].split('\n').map((l) => (l.match(/-\s+(\S+)/) || [])[1]).filter(Boolean);
    const declEnd = block.index + block[0].length;
    const body = text.slice(declEnd);
    // Both spellings are the same thing to Actions: `inputs.X` on a
    // workflow_dispatch job, and the older `github.event.inputs.X`.
    const passedThrough = new RegExp(`\\$\\{\\{\\s*(?:github\\.event\\.)?inputs\\.${inputName}\\s*\\}\\}`).test(body);

    if (opts.length === 0) {
      errors.push(`${file}: choice input "${inputName}" declares no options, so it can never be dispatched with a value.`);
      continue;
    }
    if (!passedThrough && !new RegExp(`inputs\\.${inputName}\\b`).test(body)) {
      errors.push(`${file}: choice input "${inputName}" offers ${opts.length} option(s) but nothing in the job ever reads inputs.${inputName}. Every option would run the same steps and the dropdown decides nothing.`);
      optionsChecked += opts.length;
      wf.options.push(...opts.map((o) => `${inputName}=${o}`));
      continue;
    }

    for (const opt of opts) {
      wf.options.push(`${inputName}=${opt}`);
      optionsChecked += 1;
      const esc = opt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const gated = new RegExp(`if:[^\\n]*inputs\\.${inputName}\\s*==\\s*'${esc}'`).test(body);
      const namedInCase = new RegExp(`^\\s*${esc}\\)`, 'm').test(body);
      if (!gated && !namedInCase && !passedThrough) {
        errors.push(`${file}: dispatch option ${inputName}=${opt} is offered but no step is gated on it and the input is not passed to any script, so choosing it runs nothing and the job still exits 0 (Rule 0).`);
      }
    }
  }

  if (wf.auto_triggers.length === 0) manualOnly.push(file);
  perWorkflow[file] = wf;
}

// ------------------------------------------- E. the recorded manual-only answer

if (manualOnly.length === 0) {
  errors.push(`no workflow in ${WORKFLOW_DIR} lacks an automatic trigger, so arm E reconciled zero workflows against ${DECL_PATH}. That is either a walk that found nothing or a declaration file that can never be wrong (Rule 0).`);
}
for (const file of manualOnly) {
  const d = declared[file];
  if (!d) {
    errors.push(`${file} has no automatic trigger, so it can never run on main unless a human dispatches it, and ${DECL_PATH} does not say whether that is deliberate. Declare it with a reason, or give it a trigger.`);
    continue;
  }
  if (d.decision !== 'INTENTIONALLY_MANUAL') {
    errors.push(`${file} is declared in ${DECL_PATH} with decision="${d.decision}"; the only decision that keeps a trigger-less workflow in the tree is INTENTIONALLY_MANUAL.`);
  }
  if (!String(d.reason || '').trim()) {
    errors.push(`${file} is declared manual-only in ${DECL_PATH} with no reason. "Intentionally manual" with no stated reason is indistinguishable from forgotten.`);
  }
}
for (const file of Object.keys(declared)) {
  if (!files.includes(file)) {
    errors.push(`${DECL_PATH} declares ${file} manual-only, but no such workflow exists in ${WORKFLOW_DIR}. Remove the stale declaration.`);
  } else if (!manualOnly.includes(file)) {
    errors.push(`${DECL_PATH} declares ${file} manual-only, but it now has automatic trigger(s): ${perWorkflow[file].auto_triggers.join(', ')}. The declaration has gone stale and is no longer describing this workflow.`);
  }
}

// -------------------------------------------------------------- Rule 0 floor

if (optionsChecked === 0) {
  errors.push(`walked ${files.length} workflow(s) and found zero dispatch choice options, so arm D examined nothing. Either the option extraction broke or every dropdown vanished; both mean this guard proved nothing (Rule 0).`);
}

// ------------------------------------------------------------------- report

const report = {
  schema_version: '1.0',
  status: errors.length ? 'FAIL' : 'PASS',
  workflows_walked: files.length,
  dispatch_options_checked: optionsChecked,
  manual_only_workflows: manualOnly,
  per_workflow: perWorkflow,
  errors,
};
fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(report, null, 2) + '\n');

if (errors.length) {
  console.error(`[workflow-manual-only-declared] FAIL: ${errors.length} issue(s)`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(
  `[workflow-manual-only-declared] PASS: ${files.length} workflow(s) walked; `
  + `${optionsChecked} dispatch option(s) each reach a gated step; ${manualOnly.length} workflow(s) with no automatic trigger (${manualOnly.join(', ')}) are each declared INTENTIONALLY_MANUAL with a reason in ${DECL_PATH}.`,
);
for (const n of notes) console.log(` - ${n}`);
