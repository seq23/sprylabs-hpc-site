#!/usr/bin/env node
// Guards the one road from a Twin Agent drop to main (overlay_agent_drop.mjs).
//
// Driven against real git: a bare "origin", a checkout standing in for the
// release lane's runner, and drop branches pushed the way the Twin Agent pushes
// them. What matters most is what is REFUSED - a branch that carries anything but
// a run directory must lay nothing onto main - so every refusal is a case, and
// each asserts the lane's working tree is byte-for-byte untouched afterwards.
// Hard-fails if zero cases execute.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'overlay_agent_drop.mjs');
const DROP = 'data/report_fixes/agent_runs/2026-09-26/bhpc';
const DROP_FILES = [`${DROP}/agent_run_manifest.json`, `${DROP}/bhpc.csv`, `${DROP}/bhpc.html`, `${DROP}/bhpc.json`];

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-test-'));
const failures = [];
let executed = 0;
function check(name, condition, detail = '') {
  executed += 1;
  if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}`);
}
function sh(cwd, ...args) {
  const r = spawnSync('git', args, {cwd, encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${r.stderr}`);
  return r.stdout.trim();
}
function run(cwd, ...args) {
  const r = spawnSync(process.execPath, [script, ...args], {cwd, encoding: 'utf8', env: {...process.env, GITHUB_OUTPUT: ''}});
  return {code: r.status, out: `${r.stdout}\n${r.stderr}`};
}
const treeState = (dir) => `${sh(dir, 'rev-parse', 'HEAD')}\n${sh(dir, 'status', '--porcelain', '--untracked-files=all', '--', '.', ':(exclude)artifacts/validation')}`;

// origin with a main that has a page; the lane's checkout; a writer's checkout.
const origin = path.join(scratch, 'origin.git');
sh(scratch, 'init', '-q', '--bare', '-b', 'main', origin);
const writer = path.join(scratch, 'writer');
sh(scratch, 'clone', '-q', origin, writer);
for (const dir of [writer]) { sh(dir, 'config', 'user.email', 't@example.invalid'); sh(dir, 'config', 'user.name', 't'); }
fs.writeFileSync(path.join(writer, 'index.html'), '<html>page</html>\n');
sh(writer, 'checkout', '-q', '-b', 'main');
sh(writer, 'add', '-A'); sh(writer, 'commit', '-q', '-m', 'base'); sh(writer, 'push', '-q', 'origin', 'main');
const lane = path.join(scratch, 'lane');
sh(scratch, 'clone', '-q', origin, lane);
sh(lane, 'config', 'user.email', 't@example.invalid'); sh(lane, 'config', 'user.name', 't');

function pushBranch(name, mutate) {
  sh(writer, 'checkout', '-q', 'main'); sh(writer, 'reset', '-q', '--hard', 'origin/main');
  sh(writer, 'checkout', '-q', '-B', name);
  mutate(writer);
  sh(writer, 'add', '-A'); sh(writer, 'commit', '-q', '-m', `citation-velocity: ${name}`);
  sh(writer, 'push', '-q', '-f', 'origin', `${name}:${name}`);
}
function writeDrop(dir, files = DROP_FILES) {
  for (const f of files) { fs.mkdirSync(path.join(dir, path.dirname(f)), {recursive: true}); fs.writeFileSync(path.join(dir, f), f.endsWith('.json') ? '{"status":"READY_FOR_ABSORPTION"}\n' : `x ${f}\n`); }
}
function laneAtMain() { sh(lane, 'fetch', '-q', 'origin'); sh(lane, 'checkout', '-q', 'main'); sh(lane, 'reset', '-q', '--hard', 'origin/main'); sh(lane, 'clean', '-q', '-fd'); }

// --- refusals: nothing is laid onto main --------------------------------------
const refusals = [
  ['a drop plus a page outside the run directory', 'agent-drop/2026-09-26-bhpc', (d) => { writeDrop(d); fs.writeFileSync(path.join(d, 'index.html'), '<html>edited by the writer</html>\n'); }, /not_a_raw_drop/],
  ['a drop without a manifest', 'agent-drop/2026-09-26-bhpc', (d) => writeDrop(d, DROP_FILES.slice(1)), /no_manifest/],
  ['a drop nested below the run directory', 'agent-drop/2026-09-26-bhpc', (d) => writeDrop(d, [...DROP_FILES, `${DROP}/deeper/x.json`]), /not_a_run_directory/],
  ['a drop that deletes a page', 'agent-drop/2026-09-26-bhpc', (d) => { writeDrop(d); fs.rmSync(path.join(d, 'index.html')); }, /drop_removes_or_renames_files|removes or renames/],
];
for (const [name, branch, mutate, expected] of refusals) {
  pushBranch(branch, mutate);
  laneAtMain();
  const before = treeState(lane);
  const c = run(lane, 'classify', branch);
  check(`classify refuses ${name}`, c.code === 1 && expected.test(c.out), `exit ${c.code} ${c.out.slice(0, 300)}`);
  const o = run(lane, 'overlay', branch);
  check(`overlay refuses ${name} and lays nothing onto main`, o.code === 1 && expected.test(o.out) && treeState(lane) === before, `exit ${o.code} ${o.out.slice(0, 300)}`);
}
for (const bad of ['feature/x', 'agent-drop/../../main', 'agent-drop/2026-09-26-bhpc;rm -rf /', 'main']) {
  laneAtMain();
  const r = run(lane, 'overlay', bad);
  check(`a branch name that is not agent-drop/<date>-<scope> is refused: ${bad}`, r.code === 1 && /not a drop branch/.test(r.out), `exit ${r.code}`);
}

// --- the good path ------------------------------------------------------------
pushBranch('agent-drop/2026-09-26-bhpc', (d) => writeDrop(d));
laneAtMain();
{
  const c = run(lane, 'classify', 'agent-drop/2026-09-26-bhpc');
  check('classify accepts a drop that is only the run directory', c.code === 0 && /PASS classify/.test(c.out), c.out.slice(0, 300));
  const v = run(lane, 'verify-landed', 'agent-drop/2026-09-26-bhpc');
  check('verify-landed fails while the drop is not on main', v.code === 1 && /not on origin\/main/.test(v.out), `exit ${v.code}`);
  const o = run(lane, 'overlay', 'agent-drop/2026-09-26-bhpc');
  const status = sh(lane, 'status', '--porcelain', '--', '.', ':(exclude)artifacts/validation').split('\n').filter(Boolean);
  check('overlay lays exactly the drop files onto main', o.code === 0 && status.length === DROP_FILES.length && DROP_FILES.every((f) => status.some((l) => l.endsWith(f))), `${o.out.slice(0, 200)} ${JSON.stringify(status)}`);
  check('overlay leaves the page alone', fs.readFileSync(path.join(lane, 'index.html'), 'utf8') === '<html>page</html>\n');
  // what the release lane does next: commit drop + pages together and push
  fs.writeFileSync(path.join(lane, 'index.html'), '<html>page repaired by the absorbed drop</html>\n');
  sh(lane, 'add', '-A', '--', '.', ':(exclude)artifacts/validation'); sh(lane, 'commit', '-q', '-m', 'spry content release: absorb'); sh(lane, 'push', '-q', 'origin', 'HEAD:main');
  const landed = run(lane, 'verify-landed', 'agent-drop/2026-09-26-bhpc');
  check('verify-landed passes once drop and pages are on main in one commit', landed.code === 0 && /PASS verify-landed/.test(landed.out), landed.out.slice(0, 300));
  laneAtMain();
  const again = run(lane, 'overlay', 'agent-drop/2026-09-26-bhpc');
  check('a second overlay of an absorbed drop is a named stop, not a change', again.code === 0 && /NAMED STOP already_on_main/.test(again.out) && sh(lane, 'status', '--porcelain', '--', '.', ':(exclude)artifacts/validation') === '', again.out.slice(0, 200));
}
{
  // The lane only ever builds on main's tip.
  laneAtMain();
  pushBranch('agent-drop/2026-10-03-bhpc', (d) => writeDrop(d, DROP_FILES.map((f) => f.replace('2026-09-26', '2026-10-03'))));
  sh(lane, 'checkout', '-q', 'HEAD~1');
  const before = treeState(lane);
  const r = run(lane, 'overlay', 'agent-drop/2026-10-03-bhpc');
  check('overlay refuses a checkout that is not origin/main', r.code === 1 && /not origin\/main/.test(r.out) && treeState(lane) === before, `exit ${r.code} ${r.out.slice(0, 200)}`);
}
{
  laneAtMain();
  const r = run(lane, 'overlay', 'agent-drop/2026-12-31-bhpc');
  check('an absent branch is a named stop that lays nothing', r.code === 0 && /NAMED STOP branch_gone/.test(r.out) && sh(lane, 'status', '--porcelain', '--', '.', ':(exclude)artifacts/validation') === '', `exit ${r.code}`);
  const v = run(lane, 'verify-landed', 'agent-drop/2026-12-31-bhpc');
  check('verify-landed cannot pass for an absent branch', v.code === 1, `exit ${v.code}`);
}
{
  const receipt = path.join(lane, 'artifacts/validation/agent-drop-overlay-receipt.json');
  check('the verdict is written as a receipt, which the commit helper never stages', fs.existsSync(receipt));
}

fs.rmSync(scratch, {recursive: true, force: true});
if (executed === 0) { console.error('[agent-drop-overlay-self-test] FAIL: zero cases executed'); process.exit(1); }
if (failures.length) {
  console.error(`[agent-drop-overlay-self-test] FAIL: ${failures.length} of ${executed} case(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[agent-drop-overlay-self-test] PASS: ${executed} case(s); a branch that is anything but a run directory lays nothing onto main, a drop is laid only onto main's tip, and it is proved on main before its branch is closed.`);
