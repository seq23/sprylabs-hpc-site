#!/usr/bin/env node
/**
 * Negative proof for the frozen-store shrink guard.
 *
 * The defect: freeze() recorded whatever was on disk with no floor, so
 * re-accepting a thinner page made the thinner page the new baseline and the
 * lost content became invisible. Its only gate, UNSCOPED_FROZEN_OUTPUT_DRIFT,
 * is disarmed by the prepare-drift-scope step that both writing lanes run
 * immediately before it. On ae39ee266 that lane re-froze 18 pages thinner while
 * validate_frozen_output_contract.mjs printed PASS 2225/2225 - it asserts schema
 * shape only, never size.
 *
 * A guard is only worth its comment if the failure comes back when you break it
 * again. frozen_outputs.mjs takes ROOT from process.cwd(), so each case below
 * builds a complete synthetic repository in a temp directory and runs the REAL
 * script against it. Nothing here is a mock of the thing being tested.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(REPO, 'scripts/authority_scale/frozen_outputs.mjs');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const failures = [];
let casesRun = 0;

/** A synthetic repo with one admitted page frozen at `beforeBytes`, then
 *  rewritten on disk at `afterBytes`. */
function makeRepo(beforeBytes, afterBytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frozen-shrink-'));
  const rel = 'page.html';
  const before = Buffer.from('<html><body>' + 'x'.repeat(beforeBytes) + '</body></html>');
  fs.mkdirSync(path.join(dir, 'data/release/frozen_accepted_outputs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'data/content'), { recursive: true });

  const h = sha(before);
  const blob = `data/release/frozen_accepted_outputs/${h}.html.gz`;
  fs.writeFileSync(path.join(dir, blob), zlib.gzipSync(before, { level: 9, mtime: 0 }));
  fs.writeFileSync(path.join(dir, 'data/release/frozen_output_registry.json'), JSON.stringify({
    schema_version: '1.1', policy: 'accepted_output_freeze',
    source_registry: 'data/content/page_admission_registry.json',
    accepted_statuses: ['ADMITTED'], mutation_scope: 'data/release/active_mutation_scope.json',
    records: { '/page.html': { path: rel, sha256: h, blob } },
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'data/content/page_admission_registry.json'), JSON.stringify({
    records: [{ path: rel, route: '/page.html', status: 'ADMITTED' }],
  }, null, 2));

  // The tree as the build now leaves it, and the mutation scope the lanes
  // hand freeze() - which, as in production, already contains the drifted route.
  fs.writeFileSync(path.join(dir, rel), '<html><body>' + 'x'.repeat(afterBytes) + '</body></html>');
  fs.writeFileSync(path.join(dir, 'data/release/active_mutation_scope.json'),
    JSON.stringify({ schema_version: '1.0', routes: ['/page.html'] }, null, 2));
  return dir;
}

function runFreeze(dir, env = {}) {
  return spawnSync(process.execPath, [SCRIPT, 'freeze'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, ...env },
  });
}

function check(name, ok, detail) {
  casesRun += 1;
  if (ok) { console.log(`  ok   ${name}`); return; }
  failures.push(`${name}: ${detail}`);
  console.log(`  FAIL ${name} -> ${detail}`);
}

console.log('[self-test:frozen-output-shrink-guard] restoring the broken state and checking the failure returns');

// 1. A page losing 22KB - the sister repo's exact magnitude - must hard-stop.
{
  const dir = makeRepo(30000, 8000);
  const r = runFreeze(dir);
  check('a page re-frozen 22KB lighter -> FAIL, not a new baseline',
    r.status === 1 && /FROZEN_OUTPUT_MATERIAL_SHRINK/.test(r.stderr || ''),
    `exit=${r.status} stderr=${(r.stderr || '').slice(0, 200)}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

// 2. Below the threshold it proceeds, but the shrink is REPORTED. Today's worst
//    real case is 890 bytes on a 29,390-byte page, which must not block a lane.
{
  const dir = makeRepo(29390, 28500);
  const r = runFreeze(dir);
  check('a 890-byte shrink -> proceeds',
    r.status === 0, `exit=${r.status} stderr=${(r.stderr || '').slice(0, 200)}`);
  check('...and is still reported rather than silent',
    /FROZEN_OUTPUT_SHRINK_REPORT/.test(r.stdout || ''), 'no shrink report on stdout');
  fs.rmSync(dir, { recursive: true, force: true });
}

// 3. A reviewed, deliberate trim can proceed - but only by a named human
//    decision, never by default.
{
  const dir = makeRepo(30000, 8000);
  const r = runFreeze(dir, { FROZEN_OUTPUT_ACCEPT_SHRINK: '1' });
  check('a material shrink with FROZEN_OUTPUT_ACCEPT_SHRINK=1 -> proceeds',
    r.status === 0, `exit=${r.status} stderr=${(r.stderr || '').slice(0, 200)}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

// 4. Growth must never be mistaken for loss.
{
  const dir = makeRepo(8000, 30000);
  const r = runFreeze(dir);
  check('a page that GREW -> proceeds with no shrink report',
    r.status === 0 && !/FROZEN_OUTPUT_SHRINK_REPORT/.test(r.stdout || ''),
    `exit=${r.status}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

// 5. No automated lane may set the override. The guard is worthless if the
//    pipeline answers its own question, which is exactly what happened to the
//    extraction-surface rebaseline gate.
{
  const offenders = [];
  const wfDir = path.join(REPO, '.github/workflows');
  for (const f of fs.readdirSync(wfDir)) {
    const t = fs.readFileSync(path.join(wfDir, f), 'utf8');
    if (/FROZEN_OUTPUT_ACCEPT_SHRINK\s*[:=]\s*['"]?1/.test(t)) offenders.push(`.github/workflows/${f}`);
  }
  const pkg = fs.readFileSync(path.join(REPO, 'package.json'), 'utf8');
  if (/FROZEN_OUTPUT_ACCEPT_SHRINK=1/.test(pkg)) offenders.push('package.json');
  check('no workflow or npm script sets FROZEN_OUTPUT_ACCEPT_SHRINK',
    offenders.length === 0, `set by: ${offenders.join(', ')}`);
}

// Rule 0.
if (casesRun === 0) {
  console.error('[self-test:frozen-output-shrink-guard] FAIL: no case ran; a self-test that tests nothing passes nothing');
  process.exit(1);
}

if (failures.length) {
  console.error(`[self-test:frozen-output-shrink-guard] FAIL: ${failures.length} of ${casesRun} case(s)`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`[self-test:frozen-output-shrink-guard] PASS: ${casesRun} case(s); the shrink guard fails when restored to the broken state and passes when repaired.`);
