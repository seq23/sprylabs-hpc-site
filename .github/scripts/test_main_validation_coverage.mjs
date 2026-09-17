#!/usr/bin/env node
// Guards how the Main Validation Sentinel establishes ABSENCE.
//
// The sentinel's job is to notice that a commit on main is covered by no Validate
// Repo run. That is a claim of absence, and a claim of absence is only worth the
// method behind it. On 2026-09-17T12:38Z the method was: scan page one of a
// paginated, branch-indexed listing of 302 runs, once, and if the SHA is not in
// it, accuse. That read returned zero for commit 343552b50681ee62d3271f88a79b3d0460ad1e84,
// which was covered by green run 35110066316 created 2026-09-16T14:39:54Z and read
// as covered=1 by the five sentinel runs before it. Issue #92 was opened against a
// commit that was fine.
//
// The opposite failure is worse and is the reason the sentinel exists at all:
// f7572445d64a28a061a658ed5cd74f0f071c5f9a really did sit on main for 23 hours with
// zero runs covering it. So this guard holds BOTH edges at once:
//
//   * a single flaky zero must NOT raise an alarm;
//   * two agreeing zeros past the grace window MUST still raise one.
//
// The checker is driven against a scripted local API rather than GitHub, so the
// flake - which cannot be summoned on demand against the real service - is
// reproducible on every run.

import {spawn} from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(here, 'check_main_validation_coverage.mjs');
const VALIDATE_PATH = '.github/workflows/validate-repo.yml';
const SHA = '343552b50681ee62d3271f88a79b3d0460ad1e84';

function commitPayload(sha, ageMinutes) {
  const when = new Date(Date.now() - ageMinutes * 60000).toISOString();
  return {
    sha,
    author: {login: 'github-actions[bot]'},
    commit: {message: 'spry content release', committer: {date: when}, author: {date: when}},
  };
}

function run(sha, conclusion = 'success', status = 'completed') {
  return {
    id: 35110066316,
    path: VALIDATE_PATH,
    head_sha: sha,
    status,
    conclusion,
    html_url: 'https://example.invalid/run',
  };
}

// `headShaReads` is a queue: one entry consumed per /actions/runs?head_sha= call,
// which is how a first read and its confirming read are made to disagree.
async function startApi({ageMinutes, headShaReads, history = 1}) {
  const queue = [...headShaReads];
  let lastServed = headShaReads[headShaReads.length - 1] ?? [];
  const calls = {headSha: 0};
  const server = http.createServer((req, res) => {
    const url = req.url || '';
    const json = (body) => {
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify(body));
    };
    if (url.includes('/actions/runs?head_sha=')) {
      calls.headSha += 1;
      const served = queue.length ? queue.shift() : lastServed;
      lastServed = served;
      return json({total_count: served.length, workflow_runs: served});
    }
    if (url.includes(`/actions/workflows/validate-repo.yml/runs`)) {
      return json({total_count: history, workflow_runs: history ? [run('other')] : []});
    }
    if (url.includes('/commits/')) {
      return json(commitPayload(SHA, ageMinutes));
    }
    res.writeHead(404);
    res.end('{}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {server, calls, port: server.address().port};
}

async function check(scenario) {
  const api = await startApi(scenario);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mvc-'));
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [checker], {
      cwd: dir,
      env: {
        ...process.env,
        GITHUB_REPOSITORY: 'seq23/sprylabs-hpc-site',
        GITHUB_TOKEN: 'stub-token',
        GITHUB_API_URL: `http://127.0.0.1:${api.port}`,
        GITHUB_OUTPUT: '',
        ABSENCE_CONFIRM_DELAY_MS: '10',
        VALIDATION_GRACE_MINUTES: '90',
      },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({code, out}));
  });
  await new Promise((r) => api.server.close(r));
  const verdictPath = path.join(dir, 'artifacts/validation/main-validation-coverage.json');
  const verdict = fs.existsSync(verdictPath) ? JSON.parse(fs.readFileSync(verdictPath, 'utf8')) : null;
  fs.rmSync(dir, {recursive: true, force: true});
  return {...result, verdict, headShaCalls: api.calls.headSha};
}

const failures = [];
let executed = 0;

async function expectCase(name, scenario, assertFn) {
  executed += 1;
  const got = await check(scenario);
  try {
    assertFn(got);
    console.log(`[main-validation-coverage-evidence] PASS: ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err.message}\n${got.out}`);
    console.error(`[main-validation-coverage-evidence] FAIL: ${name}: ${err.message}`);
  }
}

const eq = (actual, expected, what) => {
  if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
};

// 1. THE FALSE ALARM. First read flakes to zero; the run has existed all along.
// This is issue #92 exactly, and it must not become an alarm.
await expectCase(
  'a single flaky zero is not evidence of absence',
  {ageMinutes: 1319, headShaReads: [[], [run(SHA)]]},
  (got) => {
    eq(got.code, 0, 'exit code');
    eq(got.verdict?.state, 'covered', 'state');
    if (got.headShaCalls < 2) throw new Error('the checker never re-read before accusing');
  }
);

// 2. THE REAL GAP. Two agreeing zeros past the grace window. The alarm must still
// fire - a guard that stops firing is not an improvement, it is the defect.
await expectCase(
  'two agreeing zeros past the grace window still raise the alarm',
  {ageMinutes: 1319, headShaReads: [[], []]},
  (got) => {
    eq(got.code, 1, 'exit code');
    eq(got.verdict?.state, 'uncovered', 'state');
  }
);

// 3. READS DISAGREE, and the second is not green. The first read is disproved, so
// no alarm is raised on it - but nothing is cleared either.
await expectCase(
  'disagreeing reads report indeterminate rather than accusing',
  {ageMinutes: 1319, headShaReads: [[], [run(SHA, null, 'in_progress')]]},
  (got) => {
    eq(got.code, 0, 'exit code');
    eq(got.verdict?.state, 'indeterminate', 'state');
  }
);

// 4. A RED RUN IS STILL RED. The absence discipline must not swallow a real
// failure, which needs no second read because it is not a claim of absence.
await expectCase(
  'a failed covering run still fails the sentinel',
  {ageMinutes: 1319, headShaReads: [[run(SHA, 'failure')]]},
  (got) => {
    eq(got.code, 1, 'exit code');
    eq(got.verdict?.state, 'red', 'state');
    eq(got.headShaCalls, 1, 'head_sha reads');
  }
);

// 5. THE GRACE WINDOW IS UNCHANGED at 90 minutes, and is not quietly widened by
// any of this.
await expectCase(
  'a fresh uncovered commit is pending, not an alarm',
  {ageMinutes: 5, headShaReads: [[], []]},
  (got) => {
    eq(got.code, 0, 'exit code');
    eq(got.verdict?.state, 'pending', 'state');
  }
);

// 6. RULE 0 FOR THE CHECKER ITSELF. No run history at all means it learned nothing
// and must say so rather than report main uncovered with confidence.
await expectCase(
  'no Validate Repo history at all is a named stop, not a coverage verdict',
  {ageMinutes: 1319, headShaReads: [[]], history: 0},
  (got) => {
    eq(got.code, 1, 'exit code');
    eq(got.verdict?.state, 'no_run_history', 'state');
  }
);

// 7. THE METHOD ITSELF. The false alarm was produced by proving absence from a
// scan of a paginated branch listing. Reverting to that shape passes every
// behavioural case above on a stub that never flakes, so the source is asserted
// too - this is the one check that survives a stub written to be agreeable.
executed += 1;
const source = fs.readFileSync(checker, 'utf8');
if (!source.includes('/actions/runs?head_sha=')) {
  failures.push(
    'coverage is no longer established by exact head_sha lookup; it is back to scanning a paginated listing'
  );
}
if (!/confirming read|coveringRunsFor\(headSha\)[\s\S]{0,4000}coveringRunsFor\(headSha\)/.test(source)) {
  failures.push('the checker no longer re-reads before claiming a commit is uncovered');
}

// Rule 0: a guard that executed nothing must never report success.
if (executed === 0) {
  console.error(
    '[main-validation-coverage-evidence] FAIL: zero cases executed; this guard proved nothing about the sentinel.'
  );
  process.exit(1);
}

if (failures.length) {
  console.error(`\n[main-validation-coverage-evidence] FAIL: ${failures.length} of ${executed} case(s) failed:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`[main-validation-coverage-evidence] PASS: ${executed} case(s) executed, 0 failed.`);
