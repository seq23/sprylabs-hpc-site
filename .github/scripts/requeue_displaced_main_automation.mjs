#!/usr/bin/env node
// Requeue a scheduled main-automation lane whose run was DISPLACED while
// pending, so the newest run of that lane on main is a run that did the work.
//
// WHY THIS EXISTS. Every writer of main shares `concurrency: group:
// main-automation` (test_commit_and_push_if_changed.sh enforces it), and
// GitHub keeps at most ONE pending run per concurrency group: a newly queued
// run cancels the pending one, whatever `cancel-in-progress` says. That knob
// only governs the RUNNING one. The cancelled run has zero jobs and no log.
//
// 2026-10-10 is the recorded instance. Search Intelligence held the group
// 13:31:40-13:45:23Z. The push run of Spry Content Release queued at 13:35:41,
// was displaced at 13:43:13 by the Daily Citation Intelligence schedule run,
// which was itself displaced at 13:44:21 by a Main Validation Sentinel
// workflow_run - so Daily Citation did nothing that day and its newest run on
// main is `cancelled`. Agent Drop Intake already re-asks for its own dispatch
// when this happens; a scheduled lane has nobody to re-ask, and that is the
// gap this closes.
//
// The decision is a pure function (decideRequeue) so the test can pin it; the
// CLI only gathers state with `gh api` and acts on the decision.
//
// Exit codes: 0 = PASS (nothing displaced) or a requeue was confirmed or a
// NAMED STOP (group busy with a pending run / autopublishing paused);
// 1 = examined nothing, a dispatch that produced no run, or a lane displaced
// REQUEUE_LIMIT times in a row (it needs a human-visible failure, not a loop).
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const GROUP = 'main-automation';
export const MAX_AGE_HOURS = 23;
export const REQUEUE_LIMIT = 4;
const BOT = 'github-actions[bot]';
const PENDING = new Set(['queued', 'pending', 'waiting', 'requested']);

// One source of truth: the workflow files. A lane is in scope when it is
// serialized on main-automation, has a schedule, and can be dispatched.
export function discoverLanes(workflowDir) {
  const lanes = [];
  for (const file of fs.readdirSync(workflowDir).filter(f => /\.ya?ml$/.test(f)).sort()) {
    const text = fs.readFileSync(path.join(workflowDir, file), 'utf8');
    const inGroup = /^\s*group:\s*main-automation\s*$/m.test(text);
    if (!inGroup) continue;
    const name = (text.match(/^name:\s*(.+?)\s*$/m) || [])[1]?.replace(/^["']|["']$/g, '') || file;
    const onBlock = (text.match(/^on:\s*\n([\s\S]*?)(?=^\S)/m) || [])[1] || '';
    lanes.push({
      file,
      name,
      scheduled: /^\s{2}schedule:\s*$/m.test(onBlock),
      dispatchable: /^\s{2}workflow_dispatch:\s*$/m.test(onBlock),
    });
  }
  return lanes;
}

function isDisplaced(run) {
  return run && run.status === 'completed' && run.conclusion === 'cancelled' && run.job_count === 0;
}

// A displaced run is ours to requeue when it was the lane's own schedule, or a
// plain re-dispatch of it by this script (bot actor, default run name). A
// dispatch carrying inputs (e.g. an agent-drop absorb, titled differently) is
// its dispatcher's to re-ask; requeuing it with defaults would run other work.
function requeueable(run, lane) {
  if (run.event === 'schedule') return true;
  return run.event === 'workflow_dispatch' && run.actor === BOT && run.display_title === lane.name;
}

/**
 * @param {object} s
 * @param {Array<{file,name,scheduled,dispatchable}>} s.lanes
 * @param {Record<string, Array<{id,event,status,conclusion,job_count,created_at,actor,display_title}>>} s.runs newest first, branch main
 * @param {boolean} s.paused runtime_control says autopublishing paused / emergency stop
 * @param {Date} s.now
 */
export function decideRequeue({lanes, runs, paused, now}) {
  const inScope = lanes.filter(l => l.scheduled && l.dispatchable);
  const report = {examined: inScope.length, displaced: [], exhausted: [], pending_in_group: [], action: null, stop: null};
  if (!inScope.length) {
    report.action = 'fail';
    report.stop = 'examined_zero_lanes: no scheduled, dispatchable workflow is serialized on main-automation, so this check governs nothing';
    return report;
  }
  for (const lane of lanes) {
    for (const run of runs[lane.file] || []) {
      if (PENDING.has(run.status)) report.pending_in_group.push({file: lane.file, id: run.id, status: run.status});
    }
  }
  for (const lane of inScope) {
    const list = runs[lane.file] || [];
    const head = list[0];
    if (!isDisplaced(head) || !requeueable(head, lane)) continue;
    const ageHours = (now - new Date(head.created_at)) / 3.6e6;
    if (ageHours > MAX_AGE_HOURS) continue; // the lane's next schedule tick is closer than a requeue
    let streak = 0;
    for (const run of list) { if (isDisplaced(run)) streak += 1; else break; }
    const entry = {file: lane.file, name: lane.name, run_id: head.id, created_at: head.created_at, displaced_streak: streak};
    if (streak >= REQUEUE_LIMIT) report.exhausted.push(entry); else report.displaced.push(entry);
  }
  report.displaced.sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (report.exhausted.length) {
    report.action = 'fail';
    report.stop = `requeue_exhausted: ${report.exhausted.map(e => `${e.name} displaced ${e.displaced_streak} times in a row`).join('; ')}; the group is saturated and needs its schedule spread, not another requeue`;
  } else if (!report.displaced.length) {
    report.action = 'none';
  } else if (paused) {
    report.action = 'stop';
    report.stop = 'runtime_paused: data/admin/runtime_control.json has autopublishing=paused or emergency_stop=true; a dispatched run would bypass the pause, so nothing is requeued';
  } else if (report.pending_in_group.length) {
    report.action = 'stop';
    report.stop = `group_has_pending_run: ${report.pending_in_group.map(p => `${p.file}#${p.id}`).join(', ')} is pending in main-automation; dispatching now would displace it. The next tick requeues.`;
  } else {
    // One per tick: two dispatches at once would displace each other.
    report.action = 'requeue';
    report.target = report.displaced[0];
  }
  return report;
}

function gh(args) {
  return JSON.parse(execFileSync('gh', ['api', ...args], {encoding: 'utf8', maxBuffer: 64 << 20}));
}

function fetchRuns(repo, file) {
  const data = gh([`repos/${repo}/actions/workflows/${file}/runs?branch=main&per_page=${REQUEUE_LIMIT + 2}`]);
  return (data.workflow_runs || []).map(r => ({
    id: r.id, event: r.event, status: r.status, conclusion: r.conclusion, created_at: r.created_at,
    actor: r.triggering_actor?.login || r.actor?.login || '', display_title: r.display_title || r.name,
    job_count: r.status === 'completed' && r.conclusion === 'cancelled' ? gh([`repos/${repo}/actions/runs/${r.id}/jobs?per_page=1`]).total_count : null,
  }));
}

function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) { console.error('[main-automation-requeue] FAIL: GITHUB_REPOSITORY is unset'); process.exit(1); }
  const lanes = discoverLanes('.github/workflows');
  const runs = {};
  for (const lane of lanes) runs[lane.file] = fetchRuns(repo, lane.file);
  const state = fs.existsSync('data/admin/runtime_control.json') ? JSON.parse(fs.readFileSync('data/admin/runtime_control.json', 'utf8')) : {};
  const paused = state.autopublishing === 'paused' || state.emergency_stop === true;
  const decision = decideRequeue({lanes, runs, paused, now: new Date()});
  let exit = 0;
  if (decision.action === 'requeue') {
    const t = decision.target;
    const since = new Date().toISOString();
    execFileSync('gh', ['workflow', 'run', t.file, '--ref', 'main', '-R', repo], {stdio: 'inherit'});
    let created = null;
    for (let i = 0; i < 18 && !created; i++) {
      execFileSync('sleep', ['10']);
      created = fetchRuns(repo, t.file).find(r => r.event === 'workflow_dispatch' && r.created_at >= since.slice(0, 19)) || null;
    }
    decision.requeued_run_id = created?.id || null;
    if (created) console.log(`[main-automation-requeue] REQUEUED: ${t.name} run ${t.run_id} was displaced while pending in main-automation; dispatched run ${created.id}`);
    else { console.error(`[main-automation-requeue] FAIL: dispatched ${t.file} but no run appeared within 3 minutes`); exit = 1; }
  } else if (decision.action === 'none') {
    console.log(`[main-automation-requeue] PASS: examined=${decision.examined} scheduled lane(s); none has a displaced newest run`);
  } else if (decision.action === 'stop') {
    console.log(`[main-automation-requeue] NAMED STOP ${decision.stop}`);
  } else {
    console.error(`[main-automation-requeue] FAIL: ${decision.stop}`);
    exit = 1;
  }
  fs.mkdirSync('artifacts/validation', {recursive: true});
  fs.writeFileSync('artifacts/validation/main-automation-requeue.json', JSON.stringify({schema_version: '1.0', generated_at: new Date().toISOString(), ...decision}, null, 2) + '\n');
  process.exit(exit);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
