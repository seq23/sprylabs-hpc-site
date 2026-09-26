#!/usr/bin/env node
// The sentinel that ACTS on a Saturday.
//
// Every Saturday since 2026-08-08 the Twin Agent has pushed its weekly BHPC
// artifact straight to main - four files under data/report_fixes/agent_runs/
// <date>/bhpc/, authored as the owner, no pull request - and every one of those
// pushes turned Validate Repo, Spry Content Release and this sentinel red at
// once (runs 31258832447, 31886339425, 32575602958, 33254892310, 34696447670,
// 35447192757). The artifact is never checked before it lands, so each weekly
// run is a bet against a contract the writer cannot see, and main carries the
// loss until a person spends the Saturday repairing the intake on top of a red
// main. Six Saturdays, six flurries of fix PRs, and the state that produced them
// - a direct, unvalidated write to the deploy branch - was never touched.
//
// This script closes that state from the repository side, where a fix can
// actually be guarded. When the Main Validation Sentinel finds main RED and the
// commit at HEAD is a raw agent drop that arrived by direct push, it:
//
//   1. preserves the drop on a branch (agent-drop/<date>-<scope>) at the exact
//      SHA that landed, so nothing the writer produced is lost;
//   2. dispatches Agent Drop Intake for that branch, which hands it to the one
//      lane that may put a drop on main (Spry Content Release, drop_branch) -
//      the drop lands there together with the pages it repairs. (This step used
//      to open a pull request; GitHub refuses that to GITHUB_TOKEN - sentinel run
//      36246107783, HTTP 403 - and a PR holding only the raw drop can never go
//      green anyway, see overlay_agent_drop.mjs.)
//   3. removes the drop from main through the shared writer helper, which
//      converges, pushes, and confirms a Validate Repo run covers the new HEAD -
//      returning main to the tree that was last validated green.
//
// The writer keeps publishing: the drop is absorbed from its branch, and only a
// tree that passes the release lane's validation reaches main.
//
// With the main ruleset in place a direct drop is refused at push time, so this
// is the fallback for a ruleset that has been removed; the sentinel alarms on
// that separately.
//
// WHAT IT DOES NOT DO. A red main whose HEAD is not a raw direct drop - a bot
// release, a human merge, a drop that DID come through a pull request - is left
// to the existing alarm. This is a targeted repair for one defect class, and it
// says so in its output rather than guessing at everything else.
//
// Classification is deliberately strict, and every refusal is named:
//   - HEAD must have exactly one parent (a direct push, not a merge);
//   - every file the commit touched must be under the drop root, and one of
//     them must be an agent_run_manifest.json;
//   - the author must not be github-actions[bot]: bot writes funnel through the
//     helper and are covered on their own SHA, so a red bot commit is a different
//     class of failure;
//   - no pull request may be associated with the commit: a drop that came
//     through a PR was validated before it landed, and reverting it would undo a
//     decision a person made.
//
// Driven by the GitHub REST API through GITHUB_API_URL so the whole decision can
// be exercised against a scripted local server (test_quarantine_raw_agent_drop.mjs).

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {DROP_ROOT, branchFor, classifyDropFiles} from './agent_drop_contract.mjs';

const BOT_LOGIN = 'github-actions[bot]';

const mode = process.argv.includes('--execute') ? 'execute' : 'classify';
const api = process.env.GITHUB_API_URL || 'https://api.github.com';
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const headSha = process.env.HEAD_SHA;
const alarmIssue = process.env.ALARM_ISSUE || '';

function die(message, code = 2) {
  console.error(`[quarantine-raw-agent-drop] FAIL: ${message}`);
  process.exit(code);
}
if (!repo) die('GITHUB_REPOSITORY is required');
if (!token) die('GITHUB_TOKEN is required');
if (!headSha || !/^[0-9a-f]{40}$/.test(headSha)) die(`HEAD_SHA must be a full commit SHA, got "${headSha || ''}"`);

async function gh(method, route, body) {
  const res = await fetch(`${api}${route}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? {'Content-Type': 'application/json'} : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return {status: res.status, json, text};
}

function output(fields) {
  const verdict = {...fields, head_sha: headSha, checked_at: new Date().toISOString()};
  console.log(JSON.stringify(verdict, null, 2));
  fs.mkdirSync('artifacts/validation', {recursive: true});
  fs.writeFileSync('artifacts/validation/raw-agent-drop-quarantine.json', `${JSON.stringify(verdict, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${String(v).replace(/\r?\n/g, ' ')}\n`);
    }
  }
}

// --- classify ---------------------------------------------------------------
const commitRes = await gh('GET', `/repos/${repo}/commits/${headSha}`);
if (commitRes.status !== 200 || !commitRes.json) die(`could not read commit ${headSha}: HTTP ${commitRes.status}`);
const commit = commitRes.json;
const files = Array.isArray(commit.files) ? commit.files.map((f) => f.filename) : null;
if (!files) die(`commit ${headSha} returned no files array; refusing to classify a commit whose contents cannot be seen`);
const parents = Array.isArray(commit.parents) ? commit.parents : [];
const authorLogin = commit.author?.login || '';
const authorName = commit.commit?.author?.name || '';
const message = commit.commit?.message || '';

function refuse(reason, detail) {
  output({action: 'none', reason, detail, author: authorLogin || authorName, files: files.length});
  console.log(`[quarantine-raw-agent-drop] STOP ${reason}: ${detail}`);
  process.exit(0);
}

if (parents.length !== 1) refuse('not_a_direct_push', `commit has ${parents.length} parent(s); a raw drop is a single-parent direct push.`);
if (!files.length) refuse('empty_commit', 'commit touched no files.');
const drop = classifyDropFiles(files);
if (!drop.ok) refuse(drop.reason, `${drop.detail} A red commit that is not exactly a drop is the existing alarm's business.`);
if (authorLogin === BOT_LOGIN || authorName === BOT_LOGIN) refuse('bot_author', `authored by ${BOT_LOGIN}; bot writes go through commit_and_push_if_changed.sh and are covered on their own SHA, so this red is a different class.`);

const pullsRes = await gh('GET', `/repos/${repo}/commits/${headSha}/pulls?per_page=100`);
if (pullsRes.status !== 200 || !Array.isArray(pullsRes.json)) die(`could not list pull requests for ${headSha}: HTTP ${pullsRes.status}`);
const merged = pullsRes.json.filter((p) => p && (p.merged_at || p.state === 'closed' && p.merge_commit_sha === headSha));
if (merged.length) refuse('arrived_through_pull_request', `commit is the merge of pull request #${merged[0].number}; it was validated before it landed and a person merged it. Not reverting a human decision.`);

const {dropDirs, runDate, scope} = drop;
const branch = branchFor(runDate, scope);
const classification = {
  action: 'quarantine',
  reason: 'raw_direct_drop_on_red_main',
  detail: `direct push by ${authorLogin || authorName} touching only ${DROP_ROOT}${runDate}/${scope}/ (${files.length} file(s)) with no pull request behind it, and Validate Repo is red on it.`,
  branch,
  drop_dirs: dropDirs.join(' '),
  run_date: runDate,
  scope,
  author: authorLogin || authorName,
  files: files.length,
};

if (mode !== 'execute') {
  output({...classification, action: 'would_quarantine'});
  console.log(`[quarantine-raw-agent-drop] classify: would quarantine ${headSha} to ${branch}`);
  process.exit(0);
}

// --- execute ----------------------------------------------------------------
// 0. The working tree must BE main at HEAD_SHA. The sentinel checks out main's
//    tip and reads main's HEAD moments later; if they differ, main moved between
//    the two reads and HEAD is no longer the drop. Nothing here may reset a
//    checkout to an older commit to make the removal fit - that is how a replay
//    reverts work that landed after the drop. Also the replay path: the helper
//    re-runs this script after a remote advance, and a main that has moved on
//    is exactly the case where the answer is "stop".
const here = spawnSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).stdout.trim();
if (here !== headSha) {
  output({...classification, action: 'none', reason: 'main_moved_on', detail: `the checkout is at ${here || '(unreadable)'} but the red verdict was for ${headSha}; main has moved on and HEAD is no longer the drop, so nothing here should revert anything.`});
  console.log(`[quarantine-raw-agent-drop] STOP main_moved_on: checkout ${here} != verdict ${headSha}`);
  process.exit(0);
}

// 1. Preserve the drop on its own branch at the exact SHA. 422 means it exists.
const refRes = await gh('POST', `/repos/${repo}/git/refs`, {ref: `refs/heads/${branch}`, sha: headSha});
if (refRes.status === 201) console.log(`[quarantine-raw-agent-drop] created ${branch} at ${headSha}`);
else if (refRes.status === 422) {
  const existing = await gh('GET', `/repos/${repo}/git/ref/heads/${branch}`);
  const at = existing.json?.object?.sha || '';
  if (at && at !== headSha) die(`${branch} already exists at ${at}, not ${headSha}; refusing to overwrite a branch that carries other work`);
  console.log(`[quarantine-raw-agent-drop] ${branch} already exists at ${headSha}`);
} else die(`could not create ${branch}: HTTP ${refRes.status} ${refRes.text.slice(0, 300)}`);

// 2. Hand the branch to Agent Drop Intake. A GITHUB_TOKEN ref creation raises
//    no push event, so the intake is dispatched explicitly; 204 is the only
//    acceptance. Without it the drop would sit on a branch nothing reads.
const intakeRes = await gh('POST', `/repos/${repo}/actions/workflows/agent-drop-intake.yml/dispatches`, {ref: 'main', inputs: {drop_branch: branch}});
if (intakeRes.status !== 204) die(`could not dispatch Agent Drop Intake for ${branch}: HTTP ${intakeRes.status} ${intakeRes.text.slice(0, 300)}; main still carries the drop`);
console.log(`[quarantine-raw-agent-drop] dispatched Agent Drop Intake for ${branch}`);

// 3. Remove the drop from main through the shared writer helper. The helper
//    converges, pushes with retry, dispatches Validate Repo and confirms a run
//    covers the new HEAD - the same predicate the sentinel checks.
for (const dir of dropDirs) {
  const rm = spawnSync('git', ['rm', '-r', '-q', '--', dir], {stdio: 'inherit'});
  if (rm.status !== 0) die(`git rm ${dir} failed`);
}
// The helper is the single main-writing choke point and is not substitutable
// in production. The override exists only so the test can prove what this
// script hands the helper, and it is honoured only when the API itself has
// been pointed at a scripted server - never against api.github.com.
const realHelper = path.join(path.dirname(new URL(import.meta.url).pathname), 'commit_and_push_if_changed.sh');
const helperOverride = process.env.QUARANTINE_WRITER_HELPER || '';
const apiIsStub = Boolean(process.env.GITHUB_API_URL) && !/^https:\/\/api\.github\.com\/?$/.test(process.env.GITHUB_API_URL);
const helper = helperOverride && apiIsStub ? helperOverride : realHelper;
if (helperOverride && !apiIsStub) console.log('[quarantine-raw-agent-drop] QUARANTINE_WRITER_HELPER ignored: the API is api.github.com, so the real helper is used');
const commitMessage = `quarantine raw agent drop ${runDate}/${scope}: moved to ${branch}, Agent Drop Intake absorbs it from there`;
// The helper replays WORKFLOW_ARGV after a remote advance. The workflow
// declares it as this very script, so a replay re-reads main's new HEAD and
// refuses (main_moved_on) rather than blindly deleting a directory from a tree
// it has not classified. Without a declaration the fallback is the removal
// itself, which --ignore-unmatch makes a no-op on a tree that lost the drop.
const removal = process.env.WORKFLOW_ARGV || dropDirs.map((d) => `git rm -r -q --ignore-unmatch -- '${d}'`).join(' && ');
const push = spawnSync('bash', [helper, commitMessage, 'main-validation-sentinel'], {
  stdio: 'inherit',
  env: {...process.env, WORKFLOW_ARGV: removal},
});
if (push.status !== 0) die(`the writer helper refused or failed to land the removal (exit ${push.status}); main still carries the drop and ${branch} holds it`, push.status || 1);

output({...classification, intake_branch: branch});
console.log(`[quarantine-raw-agent-drop] PASS: ${headSha} preserved on ${branch}, Agent Drop Intake dispatched for it, and removed from main`);
