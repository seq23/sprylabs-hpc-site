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

const runs = await gh(
  `/repos/${repo}/actions/workflows/${workflowFile}/runs?branch=main&per_page=100`
);
const covering = (runs.workflow_runs || []).filter((r) => r.head_sha === headSha);
const green = covering.find((r) => r.conclusion === 'success');
const failed = covering.find((r) => r.conclusion === 'failure' || r.conclusion === 'timed_out');
const pending = covering.find((r) => r.status !== 'completed');

const context =
  `main is at ${headSha} ("${headMessage}") by ${headAuthor}, committed ${headDate} ` +
  `(${Math.round(ageMinutes)} minutes ago). Validate Repo runs covering that exact commit: ${covering.length}.`;

// Rule 0: if the API returned no Validate Repo history at all, this check learned
// nothing about main and must not report that main is fine.
if (!Array.isArray(runs.workflow_runs) || runs.workflow_runs.length === 0) {
  console.error(
    `[main-validation-coverage] FAIL: ${workflowFile} has no run history on main at all. ` +
      'This check examined zero runs and cannot conclude anything about coverage.'
  );
  writeVerdict('no_run_history', `Validate Repo has no run history on main; coverage cannot be established.`);
  process.exit(1);
}

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
      `detail<<VERDICT_EOF\n${detail}\n${context}\nVERDICT_EOF\n`
    );
  }
}

if (green) {
  writeVerdict('covered', `Covered by green Validate Repo run ${green.id} (${green.html_url}).`);
  console.log(`[main-validation-coverage] PASS: ${context}`);
  process.exit(0);
}

if (failed) {
  writeVerdict(
    'red',
    `Validate Repo run ${failed.id} FAILED on this commit: ${failed.html_url}. main is red right now.`
  );
  console.error(`[main-validation-coverage] FAIL (red): ${context}`);
  process.exit(1);
}

if (pending) {
  console.log(`[main-validation-coverage] PENDING: run ${pending.id} is still ${pending.status}. ${context}`);
  writeVerdict('pending', `Validate Repo run ${pending.id} is still ${pending.status}.`);
  process.exit(0);
}

if (ageMinutes <= graceMinutes) {
  console.log(
    `[main-validation-coverage] PENDING: no run yet, but the commit is only ${Math.round(ageMinutes)} minutes old (grace ${graceMinutes}m). ${context}`
  );
  writeVerdict('pending', `No covering run yet; within the ${graceMinutes}-minute grace window.`);
  process.exit(0);
}

writeVerdict(
  'uncovered',
  `NO Validate Repo run has ever covered this commit, and it is ${Math.round(ageMinutes)} minutes old ` +
    `(past the ${graceMinutes}-minute grace window). This is the b3aec016c shape: an automated writer ` +
    `landed on main and nothing validated it.`
);
console.error(`[main-validation-coverage] FAIL (uncovered): ${context}`);
process.exit(1);
