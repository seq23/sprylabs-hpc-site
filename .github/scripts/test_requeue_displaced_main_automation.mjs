#!/usr/bin/env node
// Pins decideRequeue (requeue_displaced_main_automation.mjs) against the
// 2026-10-10 displacement and its neighbours, and checks that discovery over
// the real .github/workflows finds the lanes it governs. Zero lanes examined
// is a failure: a requeue that can see no lane cannot requeue one.
import {discoverLanes, decideRequeue, REQUEUE_LIMIT} from './requeue_displaced_main_automation.mjs';

const errors = [];
let cases = 0;
function expect(label, ok, detail = '') { cases += 1; if (!ok) errors.push(`${label}${detail ? `: ${detail}` : ''}`); }

const lanes = discoverLanes('.github/workflows');
const daily = lanes.find(l => l.file === 'daily-citation-intelligence.yml');
expect('discovery finds main-automation lanes', lanes.length > 0, `lanes=${lanes.length}`);
expect('Daily Citation Intelligence is a scheduled, dispatchable main-automation lane', daily?.scheduled === true && daily?.dispatchable === true, JSON.stringify(daily));
expect('a dispatch-only lane (Admin Command) is not in requeue scope', lanes.some(l => l.file === 'admin-command.yml' && !l.scheduled));
expect('Validate Repo (own group) is not a main-automation lane', !lanes.some(l => l.file === 'validate-repo.yml'));

const now = new Date('2026-10-10T15:00:00Z');
const L = [
  {file: 'daily-citation-intelligence.yml', name: 'Daily Citation Intelligence', scheduled: true, dispatchable: true},
  {file: 'spry-content-release.yml', name: 'Spry Content Release', scheduled: true, dispatchable: true},
  {file: 'admin-command.yml', name: 'Admin Command', scheduled: false, dispatchable: true},
];
const ok = (id, created_at, event = 'schedule') => ({id, event, status: 'completed', conclusion: 'success', job_count: null, created_at, actor: 'github-actions[bot]', display_title: 'x'});
const displaced = (id, created_at, extra = {}) => ({id, event: 'schedule', status: 'completed', conclusion: 'cancelled', job_count: 0, created_at, actor: 'github-actions[bot]', display_title: 'Daily Citation Intelligence', ...extra});

// The recorded instance: newest Daily Citation run displaced, group idle now.
const real = decideRequeue({lanes: L, now, paused: false, runs: {
  'daily-citation-intelligence.yml': [displaced(38056803047, '2026-10-10T13:43:12Z'), ok(37939461175, '2026-10-09T13:48:12Z')],
  'spry-content-release.yml': [{...ok(38059697209, '2026-10-10T14:27:50Z'), conclusion: 'failure'}, {...displaced(38056318272, '2026-10-10T13:35:41Z'), event: 'push', display_title: 'citation-velocity'}],
}});
expect('2026-10-10: the displaced Daily Citation run is requeued', real.action === 'requeue' && real.target?.run_id === 38056803047, JSON.stringify(real));
expect('2026-10-10: a lane whose newest run is not displaced (Content Release) is left alone', !real.displaced.some(d => d.file === 'spry-content-release.yml'));

// A cancel after jobs started is a human or timeout cancel, not displacement.
const humanCancel = decideRequeue({lanes: L, now, paused: false, runs: {'daily-citation-intelligence.yml': [displaced(1, '2026-10-10T13:43:12Z', {job_count: 1})]}});
expect('a cancel with jobs is not requeued', humanCancel.action === 'none', JSON.stringify(humanCancel));

// A pending run in the group must not be displaced by our own dispatch.
const busy = decideRequeue({lanes: L, now, paused: false, runs: {
  'daily-citation-intelligence.yml': [displaced(1, '2026-10-10T13:43:12Z')],
  'admin-command.yml': [{id: 9, event: 'workflow_dispatch', status: 'queued', conclusion: null, created_at: '2026-10-10T14:59:00Z'}],
}});
expect('a pending run in the group is a NAMED STOP, not a displacement', busy.action === 'stop' && /^group_has_pending_run/.test(busy.stop), JSON.stringify(busy));

const paused = decideRequeue({lanes: L, now, paused: true, runs: {'daily-citation-intelligence.yml': [displaced(1, '2026-10-10T13:43:12Z')]}});
expect('a pause is honoured with a NAMED STOP', paused.action === 'stop' && /^runtime_paused/.test(paused.stop), JSON.stringify(paused));

const stale = decideRequeue({lanes: L, now, paused: false, runs: {'daily-citation-intelligence.yml': [displaced(1, '2026-10-09T13:43:12Z')]}});
expect('a displacement older than the next schedule tick is left to the schedule', stale.action === 'none', JSON.stringify(stale));

const dropDispatch = decideRequeue({lanes: L, now, paused: false, runs: {'spry-content-release.yml': [displaced(2, '2026-10-10T14:00:00Z', {event: 'workflow_dispatch', display_title: 'Spry Content Release: absorb agent-drop/2026-10-10-bhpc'})]}});
expect('a displaced dispatch with inputs is its dispatcher\'s to re-ask', dropDispatch.action === 'none', JSON.stringify(dropDispatch));

const ourRedispatch = decideRequeue({lanes: L, now, paused: false, runs: {'daily-citation-intelligence.yml': [displaced(3, '2026-10-10T14:10:00Z', {event: 'workflow_dispatch'}), displaced(1, '2026-10-10T13:43:12Z')]}});
expect('a displaced requeue is requeued again', ourRedispatch.action === 'requeue' && ourRedispatch.target.displaced_streak === 2, JSON.stringify(ourRedispatch));

const saturated = decideRequeue({lanes: L, now, paused: false, runs: {'daily-citation-intelligence.yml': Array.from({length: REQUEUE_LIMIT}, (_, i) => displaced(10 + i, `2026-10-10T14:${String(50 - i).padStart(2, '0')}:00Z`, i ? {} : {event: 'workflow_dispatch'}))}});
expect('a lane displaced REQUEUE_LIMIT times fails visibly', saturated.action === 'fail' && /^requeue_exhausted/.test(saturated.stop), JSON.stringify(saturated));

const twoDisplaced = decideRequeue({lanes: L, now, paused: false, runs: {
  'daily-citation-intelligence.yml': [displaced(1, '2026-10-10T13:43:12Z')],
  'spry-content-release.yml': [displaced(2, '2026-10-10T14:27:50Z', {display_title: 'Spry Content Release'})],
}});
expect('one requeue per tick, oldest displacement first', twoDisplaced.action === 'requeue' && twoDisplaced.target.run_id === 1 && twoDisplaced.displaced.length === 2, JSON.stringify(twoDisplaced));

const none = decideRequeue({lanes: [], now, paused: false, runs: {}});
expect('zero lanes examined fails', none.action === 'fail' && /^examined_zero_lanes/.test(none.stop), JSON.stringify(none));

if (errors.length) {
  console.error(`[test:main-automation-requeue] FAIL: ${errors.length} of ${cases} case(s)`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`[test:main-automation-requeue] PASS: ${cases} case(s); lanes discovered=${lanes.length}`);
