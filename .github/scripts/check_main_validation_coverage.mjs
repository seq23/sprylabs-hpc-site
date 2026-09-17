#!/usr/bin/env node
// Answers one question about main: is the commit sitting there right now covered
// by a green Validate Repo run?
//
// This exists because "a run went red" and "no run ever happened" look identical
// from outside, and the second is what actually occurred. On 2026-08-31 the last
// green run on main was 33348287639 at 01:40Z on dab147a98; b3aec016c landed at
// 01:43Z and was covered by zero runs, because a push made with GITHUB_TOKEN
// raises no push event. main failed three validators for over two hours and
// nothing anywhere said so.
//
// The dispatch in commit_and_push_if_changed.sh is the gate. This is the alarm
// that fires when the gate is bypassed, removed, or simply fails - including for
// a writer that does not exist yet. It runs on a schedule, so unlike everything
// that keys off a push event, nothing a token does can make it not run.

import fs from 'node:fs';

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const api = process.env.GITHUB_API_URL || 'https://api.github.com';
const graceMinutes = Number(process.env.VALIDATION_GRACE_MINUTES || 90);
const workflowFile = 'validate-repo.yml';
// Overridable only so the check can be exercised against a known-covered and a
// known-uncovered commit. Defaults to main, which is the only ref it guards.
const ref = process.env.MAIN_REF || 'main';

if (!repo || !token) {
  console.error('[main-validation-coverage] GITHUB_REPOSITORY and GITHUB_TOKEN are required');
  process.exit(2);
}

async function gh(path) {
  const res = await fetch(`${api}${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

const head = await gh(`/repos/${repo}/commits/${ref}`);
const headSha = head.sha;
const headAuthor = head.author?.login || head.commit?.author?.name || 'unknown';
const headMessage = (head.commit?.message || '').split('\n')[0];
const headDate = head.commit?.committer?.date || head.commit?.author?.date;
const ageMinutes = headDate ? (Date.now() - Date.parse(headDate)) / 60000 : 0;

// HOW ABSENCE IS ESTABLISHED, which is the whole difficulty of this check.
//
// This used to scan page one of
//   /actions/workflows/validate-repo.yml/runs?branch=main&per_page=100
// and treat "this SHA is not in that page" as proof that no run covers it. That
// is a scan of a paginated, branch-indexed listing (302 runs and growing), read
// once, and a single unlucky read of it is indistinguishable from the real gap
// this alarm exists to report.
//
// It produced a false alarm on 2026-09-17. Commit 343552b50681ee62d3271f88a79b3d0460ad1e84
// was covered by green Validate Repo run 35110066316, created 2026-09-16T14:39:54Z.
// Five consecutive sentinel runs read that pair and recorded covering_runs: 1
// (16:29Z, 20:27Z, 01:01Z, 04:32Z, 08:35Z). The 12:38Z run read covering_runs: 0
// on the identical inputs and opened issue #92. Both inputs are immutable and the
// run predates every one of those six reads, so the zero was a READ ERROR, not a
// state. An alarm that cries wolf on its own API flake is the same defect as an
// alarm nobody reads.
//
// Two changes, and neither loosens what counts as covered:
//
//   1. ASK THE INDEX, NOT THE LISTING. /actions/runs?head_sha=<sha> is an exact
//      lookup for the precise question being asked. No pagination window, no
//      branch index, no dependence on how many runs have happened since.
//   2. A CLAIM OF ABSENCE NEEDS A SECOND, AGREEING READ. Zero runs is the only
//      verdict here that accuses; it is the only one re-read before it speaks.
//      If the confirming read disagrees, the first read has been PROVED wrong and
//      the check says so as `indeterminate` rather than raising an alarm it now
//      knows to be false.
//
// The grace window is untouched at 90 minutes, no author is exempt, a red run is
// still red, and a genuinely uncovered commit still fails exactly as before: two
// agreeing reads of zero past the grace window is an alarm. What no longer counts
// as evidence is looking once, in the wrong index, and seeing nothing.
const workflowPath = `.github/workflows/${workflowFile}`;

// Declared before any verdict can be written: writeVerdict reports covering.length,
// and the no_run_history stop below can fire before the first coverage read.
let covering = [];

async function coveringRunsFor(sha) {
  const res = await gh(`/repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`);
  if (!Array.isArray(res.workflow_runs)) {
    throw new Error(`head_sha query for ${sha} returned no workflow_runs array`);
  }
  return res.workflow_runs.filter((r) => r.path === workflowPath);
}

// Derived at use time, not frozen at the first read: the confirming read below can
// replace `covering`, and a verdict whose context contradicts its own count is how
// an alarm stops being believed.
const contextFor = () =>
  `main is at ${headSha} ("${headMessage}") by ${headAuthor}, committed ${headDate} ` +
  `(${Math.round(ageMinutes)} minutes ago). Validate Repo runs covering that exact commit: ${covering.length}.`;

function writeVerdict(state, detail) {
  const verdict = { state, head_sha: headSha, head_author: headAuthor, head_message: headMessage, covering_runs: covering.length, detail, checked_at: new Date().toISOString() };
  console.log(JSON.stringify(verdict, null, 2));
  // The verdict outlives the runner. A judgement that dies with the log is the
  // same class of problem as a run nobody reads.
  fs.mkdirSync('artifacts/validation', { recursive: true });
  fs.writeFileSync('artifacts/validation/main-validation-coverage.json', JSON.stringify(verdict, null, 2) + '\n');
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `state=${state}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `head_sha=${headSha}\n`);
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `detail<<VERDICT_EOF\n${detail}\n${contextFor()}\nVERDICT_EOF\n`
    );
  }
}

// Rule 0 for this check: it must be able to prove it can see run history at all.
// Without this, a repository-wide API outage returns empty arrays everywhere and
// the check would report every commit uncovered with total confidence.
const anyHistory = await gh(
  `/repos/${repo}/actions/workflows/${workflowFile}/runs?branch=main&per_page=1`
);
if (!Array.isArray(anyHistory.workflow_runs) || anyHistory.total_count === 0) {
  console.error(
    `[main-validation-coverage] FAIL: ${workflowFile} has no run history on main at all. ` +
      'This check examined zero runs and cannot conclude anything about coverage.'
  );
  writeVerdict('no_run_history', `Validate Repo has no run history on main; coverage cannot be established.`);
  process.exit(1);
}

covering = await coveringRunsFor(headSha);
const green = covering.find((r) => r.conclusion === 'success');
const failed = covering.find((r) => r.conclusion === 'failure' || r.conclusion === 'timed_out');
const pending = covering.find((r) => r.status !== 'completed');

if (green) {
  writeVerdict('covered', `Covered by green Validate Repo run ${green.id} (${green.html_url}).`);
  console.log(`[main-validation-coverage] PASS: ${contextFor()}`);
  process.exit(0);
}

if (failed) {
  writeVerdict(
    'red',
    `Validate Repo run ${failed.id} FAILED on this commit: ${failed.html_url}. main is red right now.`
  );
  console.error(`[main-validation-coverage] FAIL (red): ${contextFor()}`);
  process.exit(1);
}

if (pending) {
  console.log(`[main-validation-coverage] PENDING: run ${pending.id} is still ${pending.status}. ${contextFor()}`);
  writeVerdict('pending', `Validate Repo run ${pending.id} is still ${pending.status}.`);
  process.exit(0);
}

if (ageMinutes <= graceMinutes) {
  console.log(
    `[main-validation-coverage] PENDING: no run yet, but the commit is only ${Math.round(ageMinutes)} minutes old (grace ${graceMinutes}m). ${contextFor()}`
  );
  writeVerdict('pending', `No covering run yet; within the ${graceMinutes}-minute grace window.`);
  process.exit(0);
}

// The only accusing verdict left. Re-read before making it.
const confirmDelayMs = Number(process.env.ABSENCE_CONFIRM_DELAY_MS || 15000);
await new Promise((r) => setTimeout(r, confirmDelayMs));

let confirming;
try {
  confirming = await coveringRunsFor(headSha);
} catch (err) {
  console.error(`[main-validation-coverage] INDETERMINATE: the confirming read failed: ${err.message}`);
  writeVerdict(
    'indeterminate',
    `A first read found no Validate Repo run for this commit, and the confirming read could not be completed (${err.message}). ` +
      'Absence is not reported on a single read, so no alarm is raised and none is cleared; the next scheduled run re-checks.'
  );
  process.exit(0);
}

if (confirming.length > 0) {
  const confirmedGreen = confirming.find((r) => r.conclusion === 'success');
  if (confirmedGreen) {
    covering = confirming;
    writeVerdict('covered', `Covered by green Validate Repo run ${confirmedGreen.id} (${confirmedGreen.html_url}). The first read of this commit returned zero runs and was contradicted by the confirming read; the zero was an API read error, not a coverage gap.`);
    console.log(`[main-validation-coverage] PASS (on confirming read): ${contextFor()}`);
    process.exit(0);
  }
  covering = confirming;
  writeVerdict(
    'indeterminate',
    `Two reads of the same immutable commit disagreed: the first returned 0 Validate Repo runs, the confirming read returned ${confirming.length}. ` +
      'The first read is therefore proved wrong, and this check will not raise an alarm on a claim it has just disproved. The next scheduled run re-checks.'
  );
  console.log(`[main-validation-coverage] INDETERMINATE (reads disagreed): ${contextFor()}`);
  process.exit(0);
}

writeVerdict(
  'uncovered',
  `NO Validate Repo run has ever covered this commit on two separate reads ${Math.round(confirmDelayMs / 1000)}s apart, and it is ${Math.round(ageMinutes)} minutes old ` +
    `(past the ${graceMinutes}-minute grace window). This is the b3aec016c shape: an automated writer ` +
    `landed on main and nothing validated it.`
);
console.error(`[main-validation-coverage] FAIL (uncovered): ${contextFor()}`);
process.exit(1);
