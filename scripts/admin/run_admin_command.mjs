#!/usr/bin/env node
/**
 * The admin control plane's one entry point.
 *
 * WHY A READ-ONLY `verify` COMMAND EXISTS.
 *
 * `Admin Command` has been dispatched exactly once in its life: run
 * 33274444603 on 2026-08-29, with action `__parse_probe__` and reason "audit
 * parse probe". Somebody wanted to know whether the workflow still parsed and
 * still reached this script. It did - and this script threw, because
 * `__parse_probe__` is not a registered command. The probe therefore proved the
 * workflow was healthy by turning it permanently red, and that failure has been
 * the workflow's latest status ever since.
 *
 * That is a design hole, not an accident. Every registered command mutates
 * data/admin/runtime_control.json and gets committed to main, so the only way to
 * confirm this lane was alive was to change production control state or to go
 * red. An operator with no reason to pause autopublishing had no green option.
 *
 * `verify` is that option. It reads the registry, asserts every mutating command
 * still has a handler in this file, checks the control state parses and carries
 * the fields the handlers assume, WRITES NOTHING, prints a NAMED STOP, and exits
 * 0. `__parse_probe__` is kept as an alias so the name already in the run history
 * resolves rather than throwing.
 *
 * Rule 0 applies to it as hard as to anything else: `verify` refuses to exit 0
 * having checked nothing. An empty registry, a registry whose mutating commands
 * have no handler, or an unreadable control state are all hard failures.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REGISTRY_PATH = 'data/admin/command_registry.json';
export const CONTROL_PATH = 'data/admin/runtime_control.json';

export function loadCommandRegistry(root = process.cwd()) {
  const reg = JSON.parse(fs.readFileSync(path.join(root, REGISTRY_PATH), 'utf8'));
  const mutating = Array.isArray(reg.mutating) ? reg.mutating : [];
  const readOnly = Array.isArray(reg.read_only) ? reg.read_only : [];
  return { mutating, read_only: readOnly, all: [...mutating, ...readOnly] };
}

const ROOT = process.cwd();
const registry = loadCommandRegistry(ROOT);
const action = process.env.ADMIN_ACTION;
const target = (process.env.ADMIN_TARGET || '').trim();

// The registry itself is load-bearing: dispatching from an empty list would
// reject every command and read as "the workflow is broken".
if (registry.mutating.length === 0) {
  console.error(`[admin-command] FAIL: ${REGISTRY_PATH} declares no mutating commands, so this control plane can change nothing.`);
  process.exit(1);
}

if (!registry.all.includes(action)) {
  // Still a hard failure - an unregistered command must never look like a
  // success - but a named one, not an unhandled throw with a stack trace.
  console.error(
    `[admin-command] FAIL unregistered_command: "${action ?? '<unset>'}" is not in ${REGISTRY_PATH}. `
    + `Registered: ${registry.mutating.join(', ')} (mutating), ${registry.read_only.join(', ')} (read-only). `
    + 'Nothing was changed.',
  );
  process.exit(1);
}

// ------------------------------------------------------------ read-only lane

if (registry.read_only.includes(action)) {
  const problems = [];

  // Every mutating command must still be dispatchable here. A command dropped
  // from this file but left in the registry would be accepted by the guard
  // above and then silently do nothing - the exact "runs but inert" shape.
  const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const handlerBody = self.slice(self.indexOf('// ------------------------------------------------------------ mutating lane'));
  const unhandled = registry.mutating.filter((c) => !handlerBody.includes(`'${c}'`));
  if (unhandled.length) problems.push(`no handler in this file for registered command(s): ${unhandled.join(', ')}`);

  let control = null;
  try { control = JSON.parse(fs.readFileSync(path.join(ROOT, CONTROL_PATH), 'utf8')); } catch (e) {
    problems.push(`${CONTROL_PATH} is unreadable or not valid JSON (${e.message})`);
  }
  if (control) {
    for (const f of ['autopublishing', 'aggressiveness']) {
      if (typeof control[f] !== 'string') problems.push(`${CONTROL_PATH} is missing string field "${f}", which every handler reads`);
    }
    if (control.suppressed_topics !== undefined && !Array.isArray(control.suppressed_topics)) {
      problems.push(`${CONTROL_PATH}.suppressed_topics is present but not an array`);
    }
  }

  // Rule 0. Exiting 0 having examined nothing is the failure this whole file is
  // an argument against.
  const examined = registry.mutating.length + (control ? 1 : 0);
  if (examined === 0) problems.push('verify examined zero commands and zero control files, so it proved nothing (Rule 0)');

  if (problems.length) {
    console.error(`[admin-command] FAIL verify: ${problems.length} issue(s)`);
    for (const p of problems) console.error(` - ${p}`);
    process.exit(1);
  }

  // The workflow reads this to keep the commit step away from a run that has
  // written nothing. It is a signal, not a decision: the YAML gate stands on its
  // own and VAL-ADMIN-COMMAND-VERIFY-LANE asserts the two agree.
  if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, 'ADMIN_COMMAND_MODE=read-only\n');

  console.log(
    `[admin-command] STOP read_only_verify (${action}): the workflow parses, reaches this script, and is internally consistent - `
    + `${registry.mutating.length} registered mutating command(s) (${registry.mutating.join(', ')}) all have a handler, and ${CONTROL_PATH} carries the fields they read `
    + `(autopublishing=${control.autopublishing}, aggressiveness=${control.aggressiveness}, suppressed_topics=${(control.suppressed_topics || []).length}). `
    + 'Nothing was written and nothing will be committed, because verifying the lane is not a change to it.',
  );
  process.exit(0);
}

// ------------------------------------------------------------ mutating lane

// Rule 0: no stage may exit 0 having done nothing. set_aggressiveness with an
// unregistered level, and suppress_topic with an empty target, used to fall
// through every branch, leave the control state unchanged, print
// "[admin-command] PASS <action>", exit 0 - and then the workflow committed
// "admin command: <action>" to main. The operator saw a green run and a commit
// for a change that never happened. Both now stop by name before anything is
// written.
const AGGRESSIVENESS = ['normal', 'aggressive', 'maximum'];
if (action === 'set_aggressiveness' && !AGGRESSIVENESS.includes(target)) {
  console.error(`[admin-command] STOP unregistered_aggressiveness: set_aggressiveness requires ADMIN_TARGET to be one of ${AGGRESSIVENESS.join(', ')}; got ${target ? `"${target}"` : 'an empty value'}. Nothing was changed.`);
  process.exit(2);
}
if (action === 'suppress_topic' && !target) {
  console.error('[admin-command] STOP missing_topic: suppress_topic requires a non-empty ADMIN_TARGET naming the topic to suppress. Nothing was changed.');
  process.exit(2);
}

const p = CONTROL_PATH;
const state = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { schema_version: '1.0', autopublishing: 'running', emergency_stop: false, aggressiveness: 'aggressive', suppressed_topics: [] };
const snap = (s) => JSON.stringify({ autopublishing: s.autopublishing, emergency_stop: s.emergency_stop, aggressiveness: s.aggressiveness, suppressed_topics: s.suppressed_topics });
const before = snap(state);
if (action === 'pause_autopublishing') { state.autopublishing = 'paused'; state.emergency_stop = false; }
if (action === 'emergency_stop') { state.autopublishing = 'paused'; state.emergency_stop = true; }
if (action === 'resume_autopublishing') { state.autopublishing = 'running'; state.emergency_stop = false; }
if (action === 'set_aggressiveness') state.aggressiveness = target;
if (action === 'suppress_topic') { state.suppressed_topics = state.suppressed_topics || []; if (!state.suppressed_topics.includes(target)) state.suppressed_topics.push(target); }
const after = snap(state);
state.last_action = { action, target, reason: process.env.ADMIN_REASON || '', at: new Date().toISOString(), changed_control_state: before !== after };
fs.mkdirSync('data/admin', { recursive: true });
fs.writeFileSync(p, JSON.stringify(state, null, 2) + '\n');
if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, 'ADMIN_COMMAND_MODE=mutating\n');
// rebuild_admin deliberately changes no control field - its work is done by the
// admin:build step that follows - so it is the one action allowed to report a
// no-change outcome, and it says so rather than claiming a change.
const noop = before === after;
if (noop && action !== 'rebuild_admin') {
  console.log(`[admin-command] PASS ${action}: control state already at the requested value (${target || 'n/a'}); no field changed.`);
} else if (noop) {
  console.log(`[admin-command] PASS ${action}: no control field changes by design; the admin rebuild that follows is this command's work.`);
} else {
  console.log(`[admin-command] PASS ${action}: ${before} -> ${after}`);
}
