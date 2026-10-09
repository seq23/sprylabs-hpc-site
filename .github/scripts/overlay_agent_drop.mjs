#!/usr/bin/env node
// The ONLY road from a Twin Agent drop to main.
//
// Seven Saturdays (2026-08-08 .. 2026-09-26) the Twin Agent pushed its weekly
// artifact straight to main and Validate Repo went red on it. That is not bad
// luck in the artifact: a raw drop is NEVER a valid main tree. The drop adds
// repair instructions for governed pages; build:all applies them, so the
// committed pages stop being the generators' fixed point and the
// extraction-surface guard fails (Validate Repo 36245892704: "5 governed
// surfaces changed"). The valid tree is the drop PLUS the pages it rewrites PLUS
// the re-derived snapshot - which only the release lane produces. A pull request
// holding just the drop is red for the same reason, forever, so "open a PR and a
// person lands it green" could never have worked either.
//
// So a drop now travels on a branch (agent-drop/<date>-<scope>, see
// agent_drop_contract.mjs) and reaches main only inside ONE commit made by
// Spry Content Release: the drop, the pages it repairs, and the snapshot that
// matches them. Direct pushes to main are refused by the repository ruleset
// (docs/runbooks/SATURDAY_AGENT_DROP_GATE.md), which the Main Validation
// Sentinel re-reads on every tick.
//
//   classify <branch>       the branch carries a drop and nothing else
//   overlay <branch>        classify, then lay the drop files onto the current
//                           checkout (main's tip) for the release lane to absorb
//   verify-landed <branch>  every drop file is on origin/main byte-for-byte
//
// Every refusal is named and changes nothing. Exit 0 = PASS or a named stop that
// is correct (already absorbed); exit 1 = refused; exit 2 = could not run.

import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {BRANCH_PATTERN, classifyDropFiles} from './agent_drop_contract.mjs';

const TAG = '[agent-drop-overlay]';
const [mode, branch] = process.argv.slice(2);

function die(message, code = 2) { console.error(`${TAG} FAIL: ${message}`); process.exit(code); }
function git(args, {allowFail = false} = {}) {
  const r = spawnSync('git', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (r.status !== 0 && !allowFail) die(`git ${args.join(' ')} failed: ${(r.stderr || '').trim().slice(0, 400)}`);
  return r;
}
function report(fields) {
  const verdict = {mode, branch, ...fields, checked_at: new Date().toISOString()};
  fs.mkdirSync('artifacts/validation', {recursive: true});
  fs.writeFileSync('artifacts/validation/agent-drop-overlay-receipt.json', `${JSON.stringify(verdict, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${String(v).replace(/\r?\n/g, ' ')}\n`);
  }
}

if (!['classify', 'overlay', 'verify-landed'].includes(mode)) die('usage: overlay_agent_drop.mjs classify|overlay|verify-landed <agent-drop/YYYY-MM-DD-scope>');
if (!BRANCH_PATTERN.test(branch || '')) {
  report({state: 'refused', reason: 'not_a_drop_branch'});
  die(`"${branch || ''}" is not a drop branch (${BRANCH_PATTERN}); nothing but agent-drop/<YYYY-MM-DD>-<scope> is carried toward main`, 1);
}

const remoteBranch = `refs/remotes/origin/${branch}`;
if (git(['fetch', '-q', 'origin', `+refs/heads/main:refs/remotes/origin/main`], {allowFail: true}).status !== 0) die('could not fetch origin main');
const fetched = git(['fetch', '-q', 'origin', `+refs/heads/${branch}:${remoteBranch}`], {allowFail: true});
if (fetched.status !== 0) {
  if (mode === 'verify-landed') die(`${branch} is gone from origin, so what landed cannot be compared with it`, 1);
  report({state: 'stopped', reason: 'branch_gone'});
  console.log(`${TAG} NAMED STOP branch_gone: ${branch} no longer exists on origin (already absorbed and deleted, or withdrawn). Nothing to carry.`);
  process.exit(0);
}

const base = git(['merge-base', 'refs/remotes/origin/main', remoteBranch], {allowFail: true}).stdout.trim();
if (!base) die(`${branch} shares no history with main; refusing to diff unrelated trees`, 1);
const nameStatus = git(['diff', '--name-status', '--no-renames', base, remoteBranch]).stdout.trim().split('\n').filter(Boolean).map((l) => l.split('\t'));
const deleting = nameStatus.filter(([s]) => s !== 'A' && s !== 'M');
if (deleting.length) {
  report({state: 'refused', reason: 'drop_removes_or_renames_files'});
  die(`${branch} removes or renames ${deleting.length} file(s) (${deleting.slice(0, 5).map(([s, f]) => `${s} ${f}`).join(', ')}); a drop only adds its run directory`, 1);
}
const files = nameStatus.map(([, f]) => f);
const verdict = classifyDropFiles(files);
if (!verdict.ok) {
  report({state: 'refused', reason: verdict.reason, files: files.length});
  die(`${branch} is not a drop (${verdict.reason}): ${verdict.detail} Nothing from it reaches main.`, 1);
}
const blobOf = (ref, file) => git(['rev-parse', '-q', '--verify', `${ref}:${file}`], {allowFail: true}).stdout.trim();
const differsFrom = (ref) => files.filter((f) => blobOf(ref, f) !== blobOf(remoteBranch, f));

if (mode === 'classify') {
  report({state: 'drop', drop_dirs: verdict.dropDirs.join(' '), run_date: verdict.runDate, scope: verdict.scope, files: files.length});
  console.log(`${TAG} PASS classify: ${branch} carries ${files.length} file(s) in ${verdict.dropDirs.join(', ')} and nothing else`);
  process.exit(0);
}

if (mode === 'verify-landed') {
  const missing = differsFrom('refs/remotes/origin/main');
  if (missing.length) {
    report({state: 'not_landed', missing: missing.length});
    die(`${missing.length} drop file(s) from ${branch} are not on origin/main as the branch has them: ${missing.slice(0, 5).join(', ')}`, 1);
  }
  report({state: 'landed', drop_dirs: verdict.dropDirs.join(' '), files: files.length});
  console.log(`${TAG} PASS verify-landed: all ${files.length} drop file(s) from ${branch} are on origin/main`);
  process.exit(0);
}

// overlay: onto the checkout the release lane is about to build, never an older one.
const head = git(['rev-parse', 'HEAD']).stdout.trim();
const mainTip = git(['rev-parse', 'refs/remotes/origin/main']).stdout.trim();
if (head !== mainTip) die(`the checkout is at ${head}, not origin/main ${mainTip}; the drop is only ever absorbed onto main's tip`, 1);
const pending = differsFrom('HEAD');
if (!pending.length) {
  report({state: 'already_on_main', drop_dirs: verdict.dropDirs.join(' '), files: files.length});
  console.log(`${TAG} NAMED STOP already_on_main: every drop file from ${branch} is already on main; the release runs as a plain agent-intake.`);
  process.exit(0);
}
git(['checkout', remoteBranch, '--', ...files]);
report({state: 'overlaid', drop_dirs: verdict.dropDirs.join(' '), run_date: verdict.runDate, scope: verdict.scope, files: files.length});
console.log(`${TAG} PASS overlay: laid ${files.length} file(s) from ${branch} onto main ${head.slice(0, 9)} (${verdict.dropDirs.join(', ')}); the release lane absorbs them and commits drop + pages as one commit`);
