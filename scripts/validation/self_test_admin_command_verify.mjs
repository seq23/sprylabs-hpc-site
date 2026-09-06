#!/usr/bin/env node
/**
 * VAL-ADMIN-COMMAND-VERIFY-LANE
 *
 * `Admin Command` has been dispatched once in its life - run 33274444603 on
 * 2026-08-29 - and that run is a failure. It was not a broken workflow. It was an
 * audit dispatching action `__parse_probe__` with reason "audit parse probe" to
 * learn whether the lane still worked. It did work; the script threw because
 * `__parse_probe__` was not a registered command. Confirming the workflow was
 * healthy is what made it red, and that red has been its latest status for a
 * week on an ACTIVE workflow.
 *
 * The fix has three parts, and each part is a way for this to come back:
 *
 *   1. A read-only `verify` command that exits 0 having actually checked
 *      something. If it ever becomes a stub that passes on an empty loop, the
 *      workflow is green and proves nothing - worse than the red it replaced.
 *   2. A `choice` input, so an unregistered command cannot be dispatched at all.
 *      If the dropdown drifts from the registry, a real command becomes
 *      undispatchable or a dead name becomes offerable again.
 *   3. A commit step gated off the read-only commands. If that gate drifts, a
 *      verify run reaches the push helper, which requests a Validate Repo run for
 *      a commit that was never made.
 *
 * THREE COMPONENTS, ONE LIST. data/admin/command_registry.json is the list;
 * the script dispatches from it and the workflow's dropdown and commit gate name
 * it in YAML, where nothing can read JSON. This guard is the link between them,
 * because "two components each keeping their own list with no link" is precisely
 * how the original defect was possible.
 *
 * Rule 0: hard-fails on zero assertions, and its own negative arms prove it is
 * not passing on empty loops - one drives `verify` against a registry with no
 * commands and requires a FAILURE, one deletes a handler and requires a FAILURE.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const WORKFLOW = '.github/workflows/admin-command.yml';
const RUNNER = 'scripts/admin/run_admin_command.mjs';
const REGISTRY = 'data/admin/command_registry.json';
const CONTROL = 'data/admin/runtime_control.json';
const OUT = process.env.ADMIN_COMMAND_VERIFY_OUT || 'artifacts/validation/admin-command-verify-lane.json';

const assertions = [];
const errors = [];
function check(name, ok, detail) {
  assertions.push({ assertion: name, passed: Boolean(ok), detail: detail || '' });
  if (!ok) errors.push(`${name}${detail ? ` - ${detail}` : ''}`);
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ------------------------------------------------------------- the one list

let registry = null;
try { registry = JSON.parse(read(REGISTRY)); } catch (e) { errors.push(`${REGISTRY} unreadable: ${e.message}`); }
const mutating = Array.isArray(registry?.mutating) ? registry.mutating : [];
const readOnly = Array.isArray(registry?.read_only) ? registry.read_only : [];

check('the command registry declares at least one mutating command', mutating.length > 0,
  `${REGISTRY} declares ${mutating.length}; a control plane that can change nothing is not a control plane`);
check('the command registry declares at least one read-only command', readOnly.length > 0,
  `${REGISTRY} declares ${readOnly.length}; without one there is no green way to probe this workflow, which is the defect this guards`);

// ------------------------------------- every registered mutating command dispatches

const runnerSrc = (() => { try { return read(RUNNER); } catch { return ''; } })();
check(`${RUNNER} is readable`, runnerSrc.length > 0);
const marker = '// ------------------------------------------------------------ mutating lane';
check(`${RUNNER} still separates its mutating lane`, runnerSrc.includes(marker),
  'the handler-parity check locates handlers after this marker; without it the check would scan the whole file and pass on comments');
const handlerBody = runnerSrc.includes(marker) ? runnerSrc.slice(runnerSrc.indexOf(marker)) : '';
for (const c of mutating) {
  check(`registered command "${c}" has a handler`, handlerBody.includes(`'${c}'`),
    `${c} is registered but nothing after the mutating-lane marker in ${RUNNER} dispatches it, so it would be accepted and then do nothing`);
}

// -------------------------------------------- the workflow agrees with the list

const wf = (() => { try { return read(WORKFLOW); } catch { return ''; } })();
check(`${WORKFLOW} is readable`, wf.length > 0);

const optionsBlock = (wf.match(/options:\n((?:\s+-\s+\S+\n)+)/) || [])[1] || '';
const options = optionsBlock.split('\n').map((l) => (l.match(/-\s+(\S+)/) || [])[1]).filter(Boolean);
check('the dispatch input is a choice with options', /type:\s*choice/.test(wf) && options.length > 0,
  `a free-text action is what let "__parse_probe__" be dispatched at all; found ${options.length} option(s)`);
const unknownOptions = options.filter((o) => !mutating.includes(o) && !readOnly.includes(o));
check('every dropdown option is a registered command', unknownOptions.length === 0,
  `${WORKFLOW} offers ${unknownOptions.join(', ')}, which ${REGISTRY} does not register; dispatching one fails exactly as the 2026-08-29 probe did`);
const missingOptions = mutating.filter((c) => !options.includes(c));
check('every mutating command is offered by the dropdown', missingOptions.length === 0,
  `${missingOptions.join(', ')} can no longer be dispatched, so the control plane has silently lost a control`);
check('at least one read-only command is offered by the dropdown', options.some((o) => readOnly.includes(o)),
  'the dropdown offers no read-only command, so an operator has no green way to probe this workflow');

// ---------------------------------------------- the commit gate matches the list

const gated = readOnly.filter((c) => new RegExp(`if:[^\\n]*inputs\\.action\\s*!=\\s*'${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(wf));
check('the commit step is gated off every read-only command', gated.length === readOnly.length,
  `${readOnly.filter((c) => !gated.includes(c)).join(', ')} would reach commit_and_push_if_changed.sh, which requests a Validate Repo run for a commit that was never made`);
const announced = readOnly.filter((c) => new RegExp(`if:[^\\n]*inputs\\.action\\s*==\\s*'${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(wf));
check('a read-only run prints a named stop instead of committing', announced.length === readOnly.length,
  `${readOnly.filter((c) => !announced.includes(c)).join(', ')} would end the job with no step explaining why nothing was committed - a stage exiting 0 having said nothing`);

// -------------------------------------------------------------- behaviour arms

/** A throwaway copy of just the admin surface, so behaviour is observed, not read. */
function scratch(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-cmd-'));
  fs.mkdirSync(path.join(dir, 'data/admin'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts/admin'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, RUNNER), path.join(dir, RUNNER));
  fs.copyFileSync(path.join(ROOT, REGISTRY), path.join(dir, REGISTRY));
  fs.copyFileSync(path.join(ROOT, CONTROL), path.join(dir, CONTROL));
  if (mutate) mutate(dir);
  return dir;
}
function run(dir, action) {
  return spawnSync(process.execPath, [RUNNER], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, ADMIN_ACTION: action, ADMIN_TARGET: '', ADMIN_REASON: 'self-test', GITHUB_ENV: '' },
  });
}
/** A stable fingerprint of every file in the scratch tree. */
function fingerprint(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(`${path.relative(dir, full)}:${fs.readFileSync(full, 'utf8').length}:${fs.readFileSync(full, 'utf8')}`);
    }
  }(dir));
  return out.join('\n');
}

// The behaviour arms below copy the admin surface into a scratch tree. Pointed
// at a tree where that surface does not exist, they used to die inside
// fs.copyFileSync with an unhandled ENOENT stack trace. That still exits
// non-zero, so it never passed on an empty input set - but "fails by name, not
// by stack trace" is the standard this very file asserts of the runner, and it
// has to hold for the guard too. A missing surface is now a named assertion.
const SURFACES = [RUNNER, REGISTRY, CONTROL];
const missingSurfaces = SURFACES.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
check('the admin surface this guard observes is present', missingSurfaces.length === 0,
  `${missingSurfaces.join(', ')} missing under ${ROOT}; the behaviour arms cannot observe a control plane that is not there, and a guard examining zero items is not passing (Rule 0)`);

const probeName = missingSurfaces.length === 0 ? readOnly[0] : null;
if (probeName) {
  const dir = scratch();
  const before = fingerprint(dir);
  const res = run(dir, probeName);
  const after = fingerprint(dir);
  check(`"${probeName}" exits 0`, res.status === 0, `exit ${res.status}; stderr: ${(res.stderr || '').trim().slice(0, 300)}`);
  check(`"${probeName}" prints a named stop`, /\[admin-command\] STOP read_only_verify/.test(res.stdout || ''),
    'a green run that does not say what it verified is indistinguishable from one that skipped');
  check(`"${probeName}" names what it examined`, new RegExp(`${mutating.length} registered mutating command`).test(res.stdout || ''),
    'the stop must report the size of the set it checked, or a stub could print the same line');
  check(`"${probeName}" writes nothing`, before === after,
    'the read-only command modified the tree, so the workflow would commit for a run that claims to change nothing');
  fs.rmSync(dir, { recursive: true, force: true });

  // NEGATIVE ARM 1 - Rule 0. Point verify at a registry with no commands. If it
  // still exits 0, every assertion above is running on an empty loop.
  const empty = scratch((d) => {
    const r = JSON.parse(fs.readFileSync(path.join(d, REGISTRY), 'utf8'));
    r.mutating = [];
    fs.writeFileSync(path.join(d, REGISTRY), JSON.stringify(r, null, 2));
  });
  const emptyRes = run(empty, probeName);
  check('verify HARD-FAILS against an empty command set', emptyRes.status !== 0,
    'verify exited 0 while examining zero commands; a validator that passes on an empty loop is not passing (Rule 0)');
  fs.rmSync(empty, { recursive: true, force: true });

  // NEGATIVE ARM 2. Delete a handler and require verify to notice. This is the
  // "runs but inert" case: the command stays dispatchable and does nothing.
  if (mutating.length) {
    const broken = scratch((d) => {
      const src = fs.readFileSync(path.join(d, RUNNER), 'utf8');
      const m = src.indexOf(marker);
      fs.writeFileSync(path.join(d, RUNNER), src.slice(0, m) + src.slice(m).split(`'${mutating[0]}'`).join("'__removed__'"));
    });
    const brokenRes = run(broken, probeName);
    check('verify HARD-FAILS when a registered command loses its handler', brokenRes.status !== 0,
      `verify exited 0 with "${mutating[0]}" registered but undispatchable`);
    check('and says which command lost its handler', new RegExp(mutating[0]).test(brokenRes.stderr || ''),
      'the failure must name the command, or an operator cannot act on it');
    fs.rmSync(broken, { recursive: true, force: true });
  }
}

// The mutating lane must still work - a fix that made verify green by breaking
// the commands would satisfy every check above.
if (missingSurfaces.length === 0 && mutating.includes('pause_autopublishing')) {
  const dir = scratch();
  const res = run(dir, 'pause_autopublishing');
  const state = JSON.parse(fs.readFileSync(path.join(dir, CONTROL), 'utf8'));
  check('a mutating command still exits 0', res.status === 0, `exit ${res.status}; stderr: ${(res.stderr || '').trim().slice(0, 300)}`);
  check('a mutating command still changes the control state', state.autopublishing === 'paused',
    `autopublishing=${state.autopublishing}; the read-only lane must not have disarmed the real commands`);
  fs.rmSync(dir, { recursive: true, force: true });
}

if (missingSurfaces.length === 0) {
  const dir = scratch();
  const res = run(dir, 'definitely_not_registered');
  check('an unregistered command still hard-fails', res.status !== 0,
    'the read-only lane must not have turned the runner into something that accepts anything');
  check('and it fails by name, not by stack trace', /\[admin-command\] FAIL unregistered_command/.test(res.stderr || ''),
    'the 2026-08-29 probe failed with an unhandled throw; the reason belongs in one readable line');
  fs.rmSync(dir, { recursive: true, force: true });
}

// ------------------------------------------------------------------- report

if (assertions.length === 0) {
  console.error('[admin-command-verify-lane] FAIL: zero assertions executed, so this self-test proved nothing (Rule 0).');
  process.exit(1);
}

const report = {
  schema_version: '1.0',
  status: errors.length ? 'FAIL' : 'PASS',
  registered_mutating: mutating,
  registered_read_only: readOnly,
  dropdown_options: options,
  assertions_executed: assertions.length,
  assertions,
  errors,
};
fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(report, null, 2) + '\n');

if (errors.length) {
  console.error(`[admin-command-verify-lane] FAIL: ${errors.length} of ${assertions.length} assertion(s)`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(
  `[admin-command-verify-lane] PASS: ${assertions.length} assertion(s); ${mutating.length} mutating and ${readOnly.length} read-only command(s) agree across `
  + `${REGISTRY}, ${RUNNER} and ${WORKFLOW}; the read-only command exits 0 writing nothing, and hard-fails on an empty command set or a missing handler.`,
);
