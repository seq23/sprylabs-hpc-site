// Behaviour: validate:repair-fixture-capability leaves no repair-fixture-* scratch
// folder and no registered scratch worktree behind, even when it is killed mid-run.
// WHY: 6 Nov 2026 her Mac's disk was down to 1.2 GB free; nine ~500 MB
// repair-fixture-* folders from runs killed on 3 Nov were part of it, because the
// cleanup lived only in a `finally`, which a signal never reaches.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const VALIDATOR = path.join(ROOT, 'scripts/validators/validate_repair_fixture_capability.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fixtures = (dir) => fs.readdirSync(dir).filter((n) => n.startsWith('repair-fixture-'));

test('a SIGTERM mid-run removes every repair-fixture-* folder and scratch worktree', async () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rf-cleanup-test-')));
  try {
    const child = spawn(process.execPath, [VALIDATOR], {
      cwd: ROOT,
      env: { ...process.env, TMPDIR: tmp, REPAIR_FIXTURE_CONCURRENCY: '2' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    const exited = new Promise((r) => child.on('close', (code, signal) => r({ code, signal })));

    // Wait until a scratch worktree really exists (folder + checked-out tree).
    const deadline = Date.now() + 90_000;
    let seen = [];
    while (Date.now() < deadline && child.exitCode === null) {
      seen = fixtures(tmp).filter((n) => fs.existsSync(path.join(tmp, n, 'tree', 'package.json')));
      if (seen.length) break;
      await sleep(100);
    }
    assert.ok(seen.length > 0, `the validator never created a scratch worktree, so cleanup was not exercised (exit ${child.exitCode}): ${stderr.slice(-400)}`);

    child.kill('SIGTERM');
    await exited;

    assert.deepEqual(fixtures(tmp), [], 'repair-fixture-* folders were left behind after SIGTERM');
    const list = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout;
    assert.ok(!list.includes(tmp), `a scratch worktree under ${tmp} is still registered after SIGTERM`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    spawnSync('git', ['worktree', 'prune'], { cwd: ROOT });
  }
});
