#!/usr/bin/env node
/**
 * A NAMED STOP MUST EXIT 0. PROVE IT BY RUNNING THE SCRIPT, NOT BY READING IT.
 *
 * WHAT WENT WRONG
 *
 * `.github/scripts/converge_tree_before_commit.sh` opens with two named stops -
 * `no_pending_changes` and `no_governed_surface_pending` - each of which prints
 * its reason and then `exit 0`. The second one listed the pending paths first:
 *
 *   printf '%s\n' "$pending" | sed 's/^/  - /' | head -40
 *
 * under `set -Eeuo pipefail`. Past 40 paths, `head` closes the pipe, `sed` takes
 * SIGPIPE, `pipefail` makes the pipeline exit 141, and `set -e` kills the script
 * BEFORE the `exit 0` on the next line. The stop had already decided to succeed
 * and printed why; it exited 141 anyway.
 *
 * commit_and_push_if_changed.sh calls that script and reads a non-zero exit as a
 * convergence failure - "Refusing to commit ... the tree did not converge" -
 * which is the exact opposite of what happened. The tree had converged so
 * completely that nothing but report JSON was left pending.
 *
 * Observed on `Spry Content Release` run 33754789536, immediately after the
 * freeze was fixed to measure a converged tree: 152 pending paths, none of them
 * HTML, `sed: couldn't flush stdout: Broken pipe`, and a release that had
 * nothing to publish failed instead of stopping cleanly. A legitimate stop that
 * exits non-zero is indistinguishable from a broken lane, which is precisely the
 * failure mode a named stop exists to prevent.
 *
 * WHAT IS ASSERTED - all of it by EXECUTING the real script in a scratch git
 * repository, because the defect was in runtime pipe behaviour and no amount of
 * reading the source would have found it:
 *
 *   A clean tree stops at no_pending_changes and exits 0.
 *   41+ pending paths, none governed, stop at no_governed_surface_pending,
 *     exit 0, and the listing is truncated with a count of the remainder.
 *     41 is the first size that crosses the truncation boundary. 2,000 is past
 *     the 64KB pipe buffer, where the old construct's SIGPIPE is deterministic
 *     rather than a matter of whether sed happened to flush before head exited -
 *     the CI failure at 152 paths was on the timing-dependent side of that line,
 *     and a self-test must not be.
 *   A pending .html is NOT swallowed by the no-governed stop - the script goes
 *     on to converge. Without this the test would pass on a script that stopped
 *     unconditionally.
 *
 * Hard-fails if it executes ZERO assertions.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, '.github/scripts/converge_tree_before_commit.sh');
const EVIDENCE = path.join(ROOT, 'artifacts/validation/named-stop-exit-code-self-test.json');

const assertions = [];
const failures = [];
const check = (name, ok, detail) => {
  assertions.push({ assertion: name, passed: Boolean(ok), detail });
  if (!ok) failures.push(`${name}: ${detail}`);
};

if (!fs.existsSync(SCRIPT)) {
  console.error(`[named-stop-exit-code-self-test] FAIL: ${SCRIPT} does not exist; there are no named stops to test.`);
  process.exit(1);
}

/** A scratch git repository, so `git status --porcelain` has something to read. */
function scratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'named-stop-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'self-test@example.invalid'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'self test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
  execFileSync('git', ['add', 'seed.txt'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'seed'], { cwd: dir });
  return dir;
}

/**
 * Run the real script against a scratch tree. The convergence loop itself is
 * never reached by the stop cases; the governed case is allowed to fail after
 * it, and only its stdout before that point is asserted on.
 */
function runScript(dir) {
  const result = spawnSync('bash', [SCRIPT, 'self-test'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: process.env.PATH },
    timeout: 120000,
  });
  return { code: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

const repos = [];
try {
  // ---- clean tree -> no_pending_changes, exit 0
  {
    const dir = scratchRepo();
    repos.push(dir);
    const { code, out } = runScript(dir);
    check(
      'a clean tree stops at no_pending_changes and exits 0',
      code === 0 && out.includes('STOP no_pending_changes'),
      `exit ${code}; output ${JSON.stringify(out.slice(0, 400))}`,
    );
  }

  // ---- more than 40 pending paths, none governed -> no_governed_surface_pending, exit 0
  for (const count of [41, 2000]) {
    const dir = scratchRepo();
    repos.push(dir);
    fs.mkdirSync(path.join(dir, 'artifacts/validation'), { recursive: true });
    for (let i = 0; i < count; i += 1) {
      fs.writeFileSync(
        path.join(dir, 'artifacts/validation', `a-fairly-long-generated-report-name-${i}.json`),
        `{"i":${i}}\n`,
      );
    }
    const { code, out } = runScript(dir);
    check(
      `${count} pending non-governed path(s) stop at no_governed_surface_pending and exit 0`,
      code === 0 && out.includes('STOP no_governed_surface_pending'),
      `exit ${code}; output ${JSON.stringify(out.slice(0, 600))}`,
    );
    check(
      `${count} pending non-governed path(s) leave no broken-pipe damage in the stop`,
      !/broken pipe/i.test(out),
      `output ${JSON.stringify(out.slice(0, 600))}`,
    );
    check(
      `${count} pending non-governed path(s) report the truncated remainder`,
      out.includes(`... and ${count - 40} more`),
      `expected the listing to name the ${count - 40} paths it did not print; output ${JSON.stringify(out.slice(-400))}`,
    );
  }

  // ---- a governed surface pending -> the stop must NOT fire
  {
    const dir = scratchRepo();
    repos.push(dir);
    fs.writeFileSync(path.join(dir, 'page.html'), '<!doctype html>\n');
    const { code, out } = runScript(dir);
    check(
      'a pending .html is not swallowed by the no-governed stop',
      !out.includes('STOP no_governed_surface_pending') && out.includes('governed surface path(s) pending'),
      `exit ${code}; output ${JSON.stringify(out.slice(0, 600))}`,
    );
  }
} finally {
  for (const dir of repos) fs.rmSync(dir, { recursive: true, force: true });
}

if (assertions.length === 0) {
  console.error('[named-stop-exit-code-self-test] FAIL: zero assertions executed, so this self-test proved nothing.');
  process.exit(1);
}

const report = {
  schema_version: '1.0',
  self_test: 'named-stop-exit-code',
  generated_at: new Date().toISOString(),
  script: '.github/scripts/converge_tree_before_commit.sh',
  assertions_executed: assertions.length,
  assertions,
  status: failures.length ? 'FAIL' : 'PASS',
  failures,
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error('[named-stop-exit-code-self-test] FAIL');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  `[named-stop-exit-code-self-test] PASS: ${assertions.length} assertion(s); every named stop in the convergence `
  + 'authority exits 0 with its reason printed, including past the listing truncation boundary, and a pending '
  + 'governed surface still converges.',
);
